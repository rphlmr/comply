import { describe, expect, it } from "vitest";
import { assert, check, definePolicies, definePolicy } from ".";

describe("Define policy", () => {
  it("should define a policy", () => {
    const policy = definePolicy(
      "has items",
      (arr: unknown[]) => arr.length > 0,
      () => new Error("Array is empty")
    );

    expect(policy.name).toBe("has items");
    expect(policy.condition).toBeInstanceOf(Function);
    expect(policy.errorFactory).toBeInstanceOf(Function);
  });

  it("should check a policy", () => {
    const policy = definePolicy(
      "has items",
      (arr: unknown[]) => arr.length > 0,
      () => new Error("Array is empty")
    );

    expect(policy.check([])).toBe(false);
    expect(policy.check([1])).toBe(true);

    expect(check(policy, [])).toBe(false);
    expect(check(policy, [1])).toBe(true);
  });

  it("should assert a policy", () => {
    const policy = definePolicy(
      "has items",
      (arr: unknown[]) => arr.length > 0,
      () => new Error("Array is empty")
    );

    expect(() => assert(policy, [])).toThrowError(new Error("Array is empty"));
    expect(() => assert(policy, [1])).not.toThrowError();
  });

  it("should define a policy without error factory", () => {
    const policy = definePolicy("has items", (arr: unknown[]) => arr.length > 0);

    expect(policy.name).toBe("has items");
    expect(policy.condition).toBeInstanceOf(Function);
    expect(policy.errorFactory).toBeInstanceOf(Function);

    expect(policy.check([])).toBe(false);
    expect(policy.check([1])).toBe(true);

    expect(() => assert(policy, [])).toThrowError(new Error("[has items] policy is not met for the argument: []"));
    expect(() => assert(policy, [1])).not.toThrowError();
  });

  it("can define a policy with a condition that takes no argument", () => {
    const policy = definePolicy("has items", () => true);

    expect(policy.check()).toBe(true);

    expect(() => assert(policy)).not.toThrowError();
  });
});

describe("Define policies", () => {
  it("should define a policy", () => {
    const policies = definePolicies(() => {
      return [
        definePolicy(
          "has items",
          (arr: unknown[]) => arr.length > 0,
          () => new Error("Array is empty")
        ),
      ];
    });

    expect(policies().policy("has items").name).toBe("has items");
    expect(policies().policy("has items").condition).toBeInstanceOf(Function);
    expect(policies().policy("has items").errorFactory).toBeInstanceOf(Function);
  });

  it("should check a policy", () => {
    const policies = definePolicies(() => {
      return [
        definePolicy(
          "has items",
          (arr: unknown[]) => arr.length > 0,
          () => new Error("Array is empty")
        ),
      ];
    });

    expect(check(policies().policy("has items"), [])).toBe(false);
    expect(check(policies().policy("has items"), [1])).toBe(true);

    expect(policies().policy("has items").check([])).toBe(false);
    expect(policies().policy("has items").check([1])).toBe(true);
  });

  it("should assert a policy", () => {
    const policies = definePolicies(() => {
      return [
        definePolicy(
          "has items",
          (arr: unknown[]) => arr.length > 0,
          () => new Error("Array is empty")
        ),
      ];
    });

    expect(() => assert(policies().policy("has items"), [])).toThrowError(new Error("Array is empty"));
    expect(() => assert(policies().policy("has items"), [1])).not.toThrowError();
  });

  it("should define a policy without error factory", () => {
    const policies = definePolicies(() => {
      return [definePolicy("has items", (arr: unknown[]) => arr.length > 0)];
    });

    expect(policies().policy("has items").name).toBe("has items");
    expect(policies().policy("has items").condition).toBeInstanceOf(Function);
    expect(policies().policy("has items").errorFactory).toBeInstanceOf(Function);

    expect(check(policies().policy("has items"), [])).toBe(false);
    expect(check(policies().policy("has items"), [1])).toBe(true);

    expect(policies().policy("has items").check([])).toBe(false);
    expect(policies().policy("has items").check([1])).toBe(true);

    expect(() => assert(policies().policy("has items"), [])).toThrowError(
      new Error("[has items] policy is not met for the argument: []")
    );
    expect(() => assert(policies().policy("has items"), [1])).not.toThrowError();
  });
});
