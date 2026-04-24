import { z } from "zod";

export enum Role {
   SYSTEM = "system",
   CONTEXT = "context",
   USER = "user",
   ASSISTANT = "assistant",
   TOOL = "tool",
}

type Function = {
   name: string | null;
   arguments: string | null;
};

type ToolCalls = {
   id: string;
   type: "function";
   function: Function;
};

export type ToolDefinition = {
   type: "function";
   function: {
      name: string;
      description: string | null;
      parameters: Record<string, unknown>;
   };
};

export enum ContentType {
   TEXT = "text",
   IMAGE_URL = "image_url",
}

export interface TextContentPart {
   type: ContentType.TEXT;
   text: string;
}

export type Messages = {
   role: Role;
   content: string | null;
   // tool_call_id: string | null;
   // tool_calls: ToolCalls[] | null;
};

export interface ChatRequest {
   model: string;
   messages: Messages[];
   temperature: number;
   top_p: number;
   tools: ToolDefinition[];
   max_tokens: number;
   seed: number;
   stream: boolean;
}

export type Choices = {
   index: number;
   message: Messages;
};

export type ChatResponse = {
   id: string;
   choices: Choices;
   finish_reason: string | null;
   usage: {
      completion_tokens: number;
      prompt_tokens: number;
      total_tokens: number;
   };
};

const ChatMessageSchema = z.object({
   role: z.nativeEnum(Role),
   content: z.string().nullable(),
});

export const ChatCompletionSchema = z.object({
   id: z.string(),
   choices: z.array(
      z.object({
         index: z.number(),
         message: ChatMessageSchema,
      }),
   ),
   usage: z.object({
      completion_tokens: z.number(),
      prompt_tokens: z.number(),
      total_tokens: z.number(),
   }),
});
