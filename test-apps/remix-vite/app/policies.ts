import { definePolicy } from "comply";

const policy = definePolicy(
  "has items",
  (arr: unknown[]) => arr.length > 0,
  () => new Error("Array is empty")
);
