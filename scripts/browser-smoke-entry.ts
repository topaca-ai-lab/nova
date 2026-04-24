import { complete, getModel } from "@nova-ai/nova-ai";

const model = getModel("google", "gemini-2.5-flash");
console.log(model.id, typeof complete);
