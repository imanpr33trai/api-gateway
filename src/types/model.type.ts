// export type Model = {
//    id: string;
//    object: "model";
//    created: number;
//    owned_by: string;
// };

import z from "zod";

// export type ModelsList = {
//    object: "list";
//    data: Model[];
// };

export const Model = z.object({
   id: z.string(),
   object: z.string("model"),
   created: z.number(),
   owned_by: z.string(),
});

export const ModelList = z.object({
   object: z.string("list"),
   data: z.array(Model),
});
export type ModelsResponse = z.infer<typeof ModelList>;
