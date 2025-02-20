// Import necessary modules from the Coda Pack SDK
import * as coda from "@codahq/packs-sdk";

// Define the pack
export const pack = coda.newPack();

// Set up user authentication with an API key
pack.setUserAuthentication({
  type: coda.AuthenticationType.HeaderBearerToken,  
  instructionsUrl: "https://platform.openai.com/account/api-keys",
  getConnectionName: async function (context) {
    // Optionally, verify the API key by making a test request
    let response = await context.fetcher.fetch({
      method: "GET",
      url: "https://api.openai.com/v1/models"
    });
    if (response.status === 200) {
      return "OpenAI API Key";
    } else {
      throw new Error("Invalid API key");
    }
  },
});

// Add a network domain for the fetcher
pack.addNetworkDomain("api.openai.com");

// Define a schema for the embeddings
const EmbeddingSchema = coda.makeObjectSchema({
  properties: {
    id: { type: coda.ValueType.String }, // added id property
    input: { type: coda.ValueType.String },
    embedding: { type: coda.ValueType.Array, items: { type: coda.ValueType.Number } },
    formatted: { type: coda.ValueType.String },
    model: { type: coda.ValueType.String },
    prompt_tokens: { type: coda.ValueType.Number },
    total_tokens: { type: coda.ValueType.Number },
  },
  displayProperty: "formatted",
  primaryProperty: "embedding",
  idProperty: "id",
});

pack.addColumnFormat({
  name: "Embedding",
  instructions: "Displays stored embedding details, including model and token usage.",
  formulaName: "FormatEmbedding"
});
 
pack.addFormula({
  name: "FormatEmbedding",
  description: "Formats a stored embedding record for display.",
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "embeddingRecord",
      description: "A JSON string that represents the stored embedding record.",
    }),
  ],
  resultType: coda.ValueType.Object,
  schema: EmbeddingSchema,
  execute: async function ([embeddingRecordStr], context) {
    if (!embeddingRecordStr) {
      return {
        id: "",
        input: "",
        embedding: [],
        formatted: "No data",
        model: "",
        prompt_tokens: 0,
        total_tokens: 0,
      };
    }
    try {
      const embeddingRecord = JSON.parse(embeddingRecordStr);
      return embeddingRecord;
    } catch (e) {
      return {
        id: "",
        input: "",
        embedding: [],
        formatted: "Invalid embedding record JSON",
        model: "",
        prompt_tokens: 0,
        total_tokens: 0,
      };
    }
  },
});

// Helper function to generate embedding data
async function generateEmbedding(text, model, context) {
  const response = await context.fetcher.fetch({
    method: 'POST',
    url: 'https://api.openai.com/v1/embeddings',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text,
      model: model,
    }),
  });
  const data = await response.body;
  if (response.status !== 200) {
    throw new Error(data.error?.message || 'Failed to generate embedding');
  }
  if (!data.data || data.data.length === 0) {
    throw new Error('No embedding returned from OpenAI');
  }
  const embeddingObj = data.data[0];
  const promptTokens = data.usage?.prompt_tokens || 0;
  const totalTokens = data.usage?.total_tokens || 0;
  const formatted = "Embedding Object";
  return {
    id: String(embeddingObj.index),
    input: text,
    embedding: embeddingObj.embedding,
    formatted: formatted,
    model: data.model,
    prompt_tokens: promptTokens,
    total_tokens: totalTokens,
  };
}

// Modify the GenerateEmbedding action to output a JSON string instead of an object
pack.addFormula({
  name: "GenerateEmbedding",
  isAction: true,
  description: "Generates an embedding vector for the given text using OpenAI's API and outputs it to a results column specified by the user.",
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "text",
      description: "The text to generate an embedding for.",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "model",
      description: "The OpenAI model to use for generating the embedding.",
      optional: true,
      autocomplete: ['text-embedding-3-small', 'text-embedding-3-large'],
    })
  ],
  resultType: coda.ValueType.String,
  execute: async function (args, context) {
    let [text, model = 'text-embedding-3-small'] = args;
    const result = await generateEmbedding(text, model, context);
    return JSON.stringify(result);
  },
});

pack.addFormula({
  name: "CosineSimilarity",
  description: "Compute the cosine similarity between two embedding arrays.",
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.NumberArray,
      name: "embeddingA",
      description: "First embedding.",
    }),
    coda.makeParameter({
      type: coda.ParameterType.NumberArray,
      name: "embeddingB",
      description: "Second embedding.",
    }),
  ],
  resultType: coda.ValueType.Number,
  execute: async function ([embeddingA, embeddingB], context) {
    if (embeddingA.length !== embeddingB.length) {
      throw new Error("Both embeddings must be of the same length.");
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < embeddingA.length; i++) {
      dotProduct += embeddingA[i] * embeddingB[i];
      normA += embeddingA[i] * embeddingA[i];
      normB += embeddingB[i] * embeddingB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  },
});