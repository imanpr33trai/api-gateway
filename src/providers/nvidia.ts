import { postValidated } from "../utils/postValidators";
import { ModelList, type ModelsResponse } from "./model.type";
import {
   ChatRequestSchema,
   ChatResponseSchema,
   Role,
   type ChatRequest,
   type Messages,
} from "./types";

const BASE_URL = "https://integrate.api.nvidia.com/v1";
type Prettify<T> = {
   [K in keyof T]: T[K];
} & {};
export const Nvidia = {
   async generateText(
      prompt: string,
      temperature?: number,
      model?: string,
      top_p?: number,
      max_tokens?: number,
      seed?: number,
      stream?: boolean,
   ): Promise<Messages[]> {
      const modelOptions: Prettify<Partial<ChatRequest>> = {
         model: model || "openai/gpt-oss-120b",
         messages: [{ role: Role.USER, content: prompt }],
         stream: stream || true,
         temperature: temperature || 0.7,
         top_p: top_p || 0.8,
         seed: seed || 42,
         max_tokens: max_tokens || 4096,
      };

      const finalbody = {
         ...modelOptions,
         ...ChatRequestSchema.parse(modelOptions),
      };

      // const body: Prettify<Partial<ChatRequest>> = {
      //    model: "openai/gpt-oss-120b",
      //    messages: [{ role: Role.USER, content: prompt }],
      //    max_tokens: 200,
      // };
      try {
         const { data, response } = await postValidated(
            `${BASE_URL}/chat/completions`,
            ChatRequestSchema,
            ChatResponseSchema,
            modelOptions,
         );
         if (!response.ok) {
            throw new Error("Nvidia API failed");
         }

         return data.choices.map((c) => c.message);
      } catch (error) {
         console.error("Error generating text with Nvidia API:", error);
      }

      // const json = await response.json();
      // const data = ChatCompletionSchema.parse(json);
   },

   async getAllModels(): Promise<ModelsResponse> {
      const response = await fetch(`${BASE_URL}/models`);

      if (!response.ok) {
         // You can log the status for debugging (Bun prints to the console):
         console.warn(
            `⚠️  Nvidia models endpoint responded ${response.status}. Returning empty list.`,
         );
         // Return an empty list that satisfies the Zod schema.
         return { object: "list", data: [] };
      }

      const json = await response.json();
      const data = ModelList.parse(json);
      return data;
   },
};
