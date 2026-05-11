// src/controllers/responses-controller.ts
import type { Context } from "hono";
import { stream } from "hono/streaming";
import { Nvidia } from "../providers/nvidia";
import type { ResponsesToOpenAIConverter } from "../converters/responses-to-openai";

export class ResponsesController {
  constructor(private converter: ResponsesToOpenAIConverter) {}

  async createResponse(c: Context): Promise<Response> {
    try {
      const responsesReq = await c.req.json();

      console.log("Incoming Responses API request:", JSON.stringify(responsesReq, null, 2));

      // Convert Responses API request -> OpenAI Chat Completions format
      const openaiReq = this.converter.convertRequest(responsesReq);

      console.log("Converted to OpenAI format:", JSON.stringify(openaiReq, null, 2));

      // Stream or non-streaming
      if (responsesReq.stream) {
        return this.handleStreaming(c, responsesReq, openaiReq);
      }

      // Call NVIDIA provider (returns Response)
      const nvidiaResp = await Nvidia.chat(openaiReq);

      // Parse the JSON
      const openaiResp = await nvidiaResp.json();

      console.log("Provider response:", JSON.stringify(openaiResp, null, 2));

      // Convert OpenAI response -> Responses API format
      const responsesResp = this.converter.convertResponse(openaiResp, responsesReq);

      return c.json(responsesResp);
    } catch (error: any) {
      console.error("Error in Responses Controller:", error);
      console.error("Error stack:", error.stack);

      return c.json(
        {
          id: "resp_error",
          object: "response",
          status: "failed",
          error: {
            code: "provider_error",
            message: error.message,
            type: error.constructor.name,
          },
        },
        502
      );
    }
  }

  private async handleStreaming(
    c: Context,
    responsesReq: any,
    openaiReq: any,
  ): Promise<Response> {
    const responseId = `resp_${Date.now()}`;
    const itemId = `msg_${Date.now()}`;
    let seq = 0;
    let contentStarted = false;
    let accumulatedText = "";

    const sseEvent = (event: string, data: any): string =>
      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    // Initial response events
    const responseObj = {
      id: responseId,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      completed_at: null,
      status: "in_progress",
      model: responsesReq.model,
    };

    const encoder = new TextEncoder();

    return stream(c, async (streamWriter) => {
      try {
        // Send initial events
        streamWriter.write(
          encoder.encode(
            sseEvent("response.created", { ...responseObj }) +
            sseEvent("response.in_progress", { ...responseObj })
          )
        );

        // Get streaming response from NVIDIA
        const nvidiaResp = await Nvidia.chatStream(openaiReq);
        if (!nvidiaResp.body) {
          throw new Error("Nvidia did not return a stream body");
        }

        const reader = nvidiaResp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed === "data: [DONE]") break;

            if (trimmed.startsWith("data: ")) {
              try {
                const chunk = JSON.parse(trimmed.slice(6));
                const delta = chunk.choices?.[0]?.delta;
                if (!delta || delta.content === undefined) continue;

                const text = delta.content ?? "";

                if (!contentStarted && text) {
                  streamWriter.write(
                    encoder.encode(
                      sseEvent("response.output_item.added", {
                        sequence_number: seq++,
                        output_index: 0,
                        item: { id: itemId, type: "message", status: "in_progress", role: "assistant", content: [] },
                      }) +
                      sseEvent("response.content_part.added", {
                        sequence_number: seq++,
                        item_id: itemId,
                        output_index: 0,
                        content_index: 0,
                        part: { type: "output_text", text: "", annotations: [] },
                      })
                    )
                  );
                  contentStarted = true;
                }

                if (text) {
                  accumulatedText += text;
                  streamWriter.write(
                    encoder.encode(
                      sseEvent("response.output_text.delta", {
                        sequence_number: seq++,
                        item_id: itemId,
                        output_index: 0,
                        content_index: 0,
                        delta: text,
                        logprobs: [],
                      })
                    )
                  );
                }
              } catch {
                // skip invalid JSON
              }
            }
          }
        }

        // Final events
        let finalEvents = "";
        if (contentStarted) {
          finalEvents += sseEvent("response.output_text.done", {
            sequence_number: seq++,
            item_id: itemId,
            output_index: 0,
            content_index: 0,
            text: accumulatedText,
          });
          finalEvents += sseEvent("response.output_item.done", {
            sequence_number: seq++,
            output_index: 0,
            item: {
              id: itemId,
              type: "message",
              status: "completed",
              role: "assistant",
              content: [{ type: "output_text", text: accumulatedText, annotations: [] }],
            },
          });
        }
        finalEvents += sseEvent("response.completed", {
          ...responseObj,
          status: "completed",
          output: contentStarted
            ? [{ id: itemId, type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: accumulatedText, annotations: [] }] }]
            : [],
        });
        streamWriter.write(encoder.encode(finalEvents));
      } catch (error: any) {
        console.error("Streaming error:", error);
        streamWriter.write(
          encoder.encode(sseEvent("response.completed", {
            ...responseObj,
            status: "failed",
            error: { message: error.message },
          }))
        );
      }
    });
  }
}
