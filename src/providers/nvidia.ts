import { ModelList, type ModelsResponse } from "../types/model.type";
import {
     ChatRequestSchema,
     ChatResponseSchema,
     Role,
     type Messages,
} from "../types/types";
import { postValidated } from "../utils/postJsonValidation";
import { postStreaming } from "../utils/postStreamValidation";

const BASE_URL = "https://integrate.api.nvidia.com/v1";

export const Nvidia = {
     async generateText(
          prompt: string,
          temperature: number = 0.7,
          model: string = "openai/gpt-oss-120b",
          top_p: number = 0.8,
          max_tokens: number = 4096,
          seed: number = 42,
          stream: boolean = false,
     ): Promise<Messages[]> {
          const modelOptions = {
               model,
               messages: [{ role: Role.USER, content: prompt }],
               temperature,
               top_p,
               max_tokens,
               seed,
               stream,
          };

          const { data } = await postValidated(
               `${BASE_URL}/chat/completions`,
               ChatRequestSchema,
               ChatResponseSchema,
               modelOptions,
               {
                    headers: {
                         Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
                    },
               },
          );

          return data.choices.map((choice) => choice.message);
     },
     async streamText(
          prompt: string,
          { signal }: { signal?: AbortSignal } = {},
          temperature: number = 0.7,
          model: string = "openai/gpt-oss-120b",
          top_p: number = 0.8,
          max_tokens: number = 16384,
          seed: number = 42,
          stream: boolean = true,
     ): Promise<ReadableStream<Uint8Array>> {
          const modelOptions = {
               model: model,
               messages: [{ role: Role.USER, content: prompt }],
               temperature: temperature,
               top_p: top_p,
               max_tokens: max_tokens,
               seed: seed,
               stream: stream,
          };

          const {
               sentBody,
               stream: readableStream,
               response,
          } = await postStreaming(
               `${BASE_URL}/chat/completions`,
               ChatRequestSchema,

               modelOptions,
               {
                    headers: {
                         Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
                    },
                    signal,
               },
          );
          return readableStream;
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
     async generateChat(messages: any[]) {
          const response = await fetch(`${BASE_URL}/chat`);
     },
};
