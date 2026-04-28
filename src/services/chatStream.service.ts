import { Nvidia } from "../providers/nvidia";

export const chatStreamService = async (
     prompt: string,
     { signal }: { signal?: AbortSignal },
) => {
     const response = await Nvidia.streamText(prompt, { signal });
     return response;
};
