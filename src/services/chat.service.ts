import { Nvidia } from "../providers/nvidia";

export const chatService = async (prompt: string) => {
   const response = await Nvidia.generateText(prompt);
   return response;
};
