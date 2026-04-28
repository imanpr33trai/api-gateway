import { z } from "zod";

export enum Role {
     SYSTEM = "system",
     CONTEXT = "context",
     USER = "user",
     ASSISTANT = "assistant",
     TOOL = "tool",
}

export const ToolFunctionSchema = z.object({
     name: z.string().nullable(),
     arguments: z.string().nullable(),
});

export type ToolFunction = z.infer<typeof ToolFunctionSchema>;

export const ToolCallSchema = z.object({
     id: z.string(),
     type: z.literal("function"),
     function: ToolFunctionSchema,
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

export const MessageSchema = z.object({
     role: z.enum(Role),
     content: z.string().nullable(),
     tool_call_id: z.string().nullable().optional().default(null),
     tool_calls: z.array(ToolCallSchema).optional().default([]),
});

export type Messages = z.infer<typeof MessageSchema>;

export const ChatRequestSchema = z
     .object({
          model: z.string(),
          messages: z.array(MessageSchema),
          temperature: z.number().optional(),
          top_p: z.number().optional(),
          max_tokens: z.number().optional(),
          tools: z.array(ToolCallSchema).optional(),
          seed: z.number().optional(),
          stream: z.boolean().optional(),
     })
     .strict();

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

const ChoiceSchema = z.object({
     index: z.number(),
     message: MessageSchema,
     finish_reason: z.string().nullable().optional(),
});

const UsageSchema = z
     .object({
          completion_tokens: z.number().optional(),
          prompt_tokens: z.number().optional(),
          total_tokens: z.number().optional(),
     })
     .optional();

export const ChatResponseSchema = z.object({
     id: z.string(),
     object: z.string().optional(),
     choices: z.array(ChoiceSchema),
     finish_reason: z.string().nullable().optional(),
     usage: UsageSchema,
     model: z.string().optional(),
     created: z.number().optional(),
});

export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const StreamChunkSchema = z.object({
     id: z.string(),
     object: z.literal("chat.completion.chunk"),
     created: z.number(),
     model: z.string(),
     choices: z.array(
          z.object({
               index: z.number(),
               delta: z.object({
                    role: z.string().optional(),
                    content: z.string().nullable().optional(),
                    reasoning_content: z.string().nullable().optional(),
               }),
               finish_reason: z.string().nullable(),
          }),
     ),
});
export interface ParsedChunk {
     id: string;
     model: string;
     content: string;
     isDone: boolean;
     role?: string;
     finish_reason?: string | null;
}
export {
     MessageSchema as ChatMessageSchema,
     ChoiceSchema,
     ToolCallSchema as ToolDefinition,
};
