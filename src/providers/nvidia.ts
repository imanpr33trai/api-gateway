import { ChatCompletionSchema, Role, type Messages } from "./types";

const BASE_URL = "https://integrate.api.nvidia.com/v1";

export const Nvidia = {
   async generateText(prompt: string): Promise<Messages[]> {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
         method: "POST",
         headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
         },
         body: JSON.stringify({
            model: "meta/llama-3.1-405b-instruct",
            messages: [{ role: Role.USER, content: prompt }],
            max_tokens: 200,
         }),
      });

      if (!response.ok) {
         throw new Error("Nvidia API failed");
      }
      const json = await response.json();
      const data = ChatCompletionSchema.parse(json);
      return data.choices.map((c) => c.message);
   },
};
