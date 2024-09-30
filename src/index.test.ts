import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { assert, and, check, definePolicies, definePolicy, matchSchema, notNull, or } from ".";

describe("Define policy", () => {
  type Post = { userId: string; comments: string[] };

  it("should define a policy", () => {
    const postHasCommentsPolicy = definePolicy(
      "post has comments",
      (post: Post) => post.comments.length > 0,
      () => new Error("Post has no comments")
    );

    expect(postHasCommentsPolicy.name).toBe("post has comments");
    expect(postHasCommentsPolicy.condition).toBeInstanceOf(Function);
    expect(postHasCommentsPolicy.errorFactory).toBeInstanceOf(Function);
  });

  it("should check a policy", () => {
    const postHasCommentsPolicy = definePolicy(
      "post has comments",
      (post: Post) => post.comments.length > 0,
      () => new Error("Post has no comments")
    );

    expect(postHasCommentsPolicy.check({ userId: "1", comments: [] })).toBe(false);
    expect(postHasCommentsPolicy.check({ userId: "1", comments: ["comment 1"] })).toBe(true);

    expect(check(postHasCommentsPolicy, { userId: "1", comments: [] })).toBe(false);
    expect(check(postHasCommentsPolicy, { userId: "1", comments: ["comment 1"] })).toBe(true);
  });

  it("should assert a policy", () => {
    const postHasCommentsPolicy = definePolicy(
      "post has comments",
      (post: Post) => post.comments.length > 0,
      () => new Error("Post has no comments")
    );

    expect(() => assert(postHasCommentsPolicy, { userId: "1", comments: [] })).toThrowError(
      new Error("Post has no comments")
    );
    expect(() => assert(postHasCommentsPolicy, { userId: "1", comments: ["comment 1"] })).not.toThrowError();
  });

  it("should accept a message as error factory", () => {
    const postHasCommentsPolicy = definePolicy(
      "post has comments",
      (post: Post) => post.comments.length > 0,
      "Post has no comments"
    );

    expect(() => assert(postHasCommentsPolicy, { userId: "1", comments: [] })).toThrowError(
      new Error("Post has no comments")
    );

    try {
      assert(postHasCommentsPolicy, { userId: "1", comments: [] });
    } catch (error) {
      expect((error as Error).name).toBe("PolicyRejection: [post has comments]");
    }
  });

  it("should define a policy without error factory", () => {
    const postHasCommentsPolicy = definePolicy("post has comments", (post: Post) => post.comments.length > 0);

    expect(postHasCommentsPolicy.name).toBe("post has comments");
    expect(postHasCommentsPolicy.condition).toBeInstanceOf(Function);
    expect(postHasCommentsPolicy.errorFactory).toBeInstanceOf(Function);

    expect(postHasCommentsPolicy.check({ userId: "1", comments: [] })).toBe(false);
    expect(postHasCommentsPolicy.check({ userId: "1", comments: ["comment 1"] })).toBe(true);

    expect(() => assert(postHasCommentsPolicy, { userId: "1", comments: [] })).toThrowError(
      new Error(
        `[post has comments] policy is not met for the argument: ${JSON.stringify({ userId: "1", comments: [] })}`
      )
    );
    expect(() => assert(postHasCommentsPolicy, { userId: "1", comments: ["comment 1"] })).not.toThrowError();
  });

  it("can define a policy with a condition that takes no argument", () => {
    const truePolicy = definePolicy("is true", () => true);

    expect(truePolicy.check()).toBe(true);

    expect(() => assert(truePolicy)).not.toThrowError();
  });

  it("should allow defining a policy on the fly", () => {
    const params = { id: "123" };

    expect(check(definePolicy("params are valid", matchSchema(z.object({ id: z.string() }))), params)).toBe(true);

    expect(check("params are valid", matchSchema(z.object({ id: z.string() })), params)).toBe(true);
  });
});

describe("Define policies", () => {
  type Context = { userId: string };
  type Post = { userId: string; comments: string[]; status: "published" | "draft" | "archived" };

  it("should define a policy set", () => {
    const postGuard = definePolicies([
      definePolicy("post has comments", (post: Post) => post.comments.length > 0),
      definePolicy("post is draft", (post: Post): post is Post & { status: "draft" } => post.status === "draft"),
    ]);

    expect(postGuard.policy("post has comments").name).toBe("post has comments");
    expect(postGuard.policy("post has comments").condition).toBeInstanceOf(Function);
    expect(postGuard.policy("post has comments").errorFactory).toBeInstanceOf(Function);
  });

  it("should check a policy from a policy set", () => {
    const guard = {
      post: definePolicies([
        definePolicy("post has comments", (post: Post) => post.comments.length > 0),
        definePolicy("post is draft", (post: Post) => post.status === "draft"),
      ]),
    };

    expect(guard.post.policy("post has comments").check({ userId: "1", comments: [], status: "published" })).toBe(
      false
    );
    expect(check(guard.post.policy("post has comments"), { userId: "1", comments: [], status: "published" })).toBe(
      false
    );

    expect(
      guard.post.policy("post has comments").check({ userId: "1", comments: ["comment 1"], status: "published" })
    ).toBe(true);
    expect(
      check(guard.post.policy("post has comments"), { userId: "1", comments: ["comment 1"], status: "published" })
    ).toBe(true);

    expect(guard.post.policy("post is draft").check({ userId: "1", comments: [], status: "published" })).toBe(false);
    expect(check(guard.post.policy("post is draft"), { userId: "1", comments: [], status: "published" })).toBe(false);

    expect(guard.post.policy("post is draft").check({ userId: "1", comments: ["comment 1"], status: "draft" })).toBe(
      true
    );
    expect(check(guard.post.policy("post is draft"), { userId: "1", comments: ["comment 1"], status: "draft" })).toBe(
      true
    );
  });

  it("should assert a policy from a policy set", () => {
    const guard = {
      post: definePolicies([
        definePolicy(
          "post has comments",
          (post: Post) => post.comments.length > 0,
          () => new Error("Post has no comments")
        ),
        definePolicy("post is draft", (post: Post) => post.status === "draft"),
      ]),
    };

    expect(() =>
      assert(guard.post.policy("post has comments"), { userId: "1", comments: [], status: "published" })
    ).toThrowError(new Error("Post has no comments"));
    expect(() =>
      assert(guard.post.policy("post has comments"), { userId: "1", comments: ["comment 1"], status: "published" })
    ).not.toThrowError();
  });

  it("should define a policy set with a factory function which takes a `context` argument", () => {
    const PostPolicies = definePolicies((context: Context) => [
      definePolicy(
        "my post",
        (post: Post) => post.userId === context.userId,
        () => new Error("Not the author")
      ),
    ]);

    const context: Context = { userId: "1" };

    const guard = {
      post: PostPolicies(context),
    };

    expect(check(guard.post.policy("my post"), { userId: "1", comments: [], status: "published" })).toBe(true);
    expect(check(guard.post.policy("my post"), { userId: "2", comments: [], status: "published" })).toBe(false);

    expect(() =>
      assert(guard.post.policy("my post"), { userId: "1", comments: [], status: "published" })
    ).not.toThrowError();
    expect(() => assert(guard.post.policy("my post"), { userId: "2", comments: [], status: "published" })).toThrowError(
      new Error("Not the author")
    );
  });

  it("should define a policy set with compound conditions that require every condition to be met", () => {
    const PostPolicies = definePolicies((context: Context) => {
      const myPostPolicy = definePolicy(
        "my post",
        (post: Post) => post.userId === context.userId,
        () => new Error("Not the author")
      );

      return [
        myPostPolicy,
        definePolicy("my published post", (post: Post) =>
          and(
            () => check(myPostPolicy, post),
            () => post.status === "published"
          )
        ),
      ];
    });

    const context: Context = { userId: "1" };

    const guard = {
      post: PostPolicies(context),
    };

    expect(check(guard.post.policy("my published post"), { userId: "1", comments: [], status: "published" })).toBe(
      true
    );
    expect(check(guard.post.policy("my published post"), { userId: "1", comments: [], status: "draft" })).toBe(false);
    expect(check(guard.post.policy("my published post"), { userId: "2", comments: [], status: "published" })).toBe(
      false
    );

    expect(() =>
      assert(guard.post.policy("my published post"), { userId: "1", comments: [], status: "published" })
    ).not.toThrowError();
    expect(() =>
      assert(guard.post.policy("my published post"), { userId: "1", comments: [], status: "draft" })
    ).toThrowError();
    expect(() =>
      assert(guard.post.policy("my published post"), { userId: "2", comments: [], status: "published" })
    ).toThrowError();
  });

  it("should define a policy set with compound conditions that require at least one condition to be met", () => {
    const PostPolicies = definePolicies((context: Context) => {
      const myPostPolicy = definePolicy(
        "my post",
        (post: Post) => post.userId === context.userId,
        () => new Error("Not the author")
      );

      return [
        myPostPolicy,
        definePolicy("all published posts or mine", (post: Post) =>
          or(
            () => check(myPostPolicy, post),
            () => post.status === "published"
          )
        ),
      ];
    });

    const context: Context = { userId: "1" };

    const guard = {
      post: PostPolicies(context),
    };

    expect(
      check(guard.post.policy("all published posts or mine"), { userId: "1", comments: [], status: "published" })
    ).toBe(true);
    expect(
      check(guard.post.policy("all published posts or mine"), { userId: "1", comments: [], status: "draft" })
    ).toBe(true);
    expect(
      check(guard.post.policy("all published posts or mine"), { userId: "2", comments: [], status: "published" })
    ).toBe(true);
    expect(
      check(guard.post.policy("all published posts or mine"), { userId: "2", comments: [], status: "draft" })
    ).toBe(false);

    expect(() =>
      assert(guard.post.policy("all published posts or mine"), { userId: "1", comments: [], status: "published" })
    ).not.toThrowError();
    expect(() =>
      assert(guard.post.policy("all published posts or mine"), { userId: "1", comments: [], status: "draft" })
    ).not.toThrowError();
    expect(() =>
      assert(guard.post.policy("all published posts or mine"), { userId: "2", comments: [], status: "published" })
    ).not.toThrowError();
    expect(() =>
      assert(guard.post.policy("all published posts or mine"), { userId: "2", comments: [], status: "draft" })
    ).toThrowError();
  });

  it("should define a policy set that composes other policy sets", () => {
    type Context = { userId: string; role: "admin" | "user" };

    const AdminPolicies = definePolicies((context: Context) => [
      definePolicy("has admin role", () => context.role === "admin"),
    ]);

    const PostPolicies = definePolicies((context: Context) => {
      const adminGuard = AdminPolicies(context);

      return [
        definePolicy("can edit comments", (post: Post) =>
          or(
            () => post.userId === context.userId,
            () => check(adminGuard.policy("has admin role"))
          )
        ),
      ];
    });

    const context: Context = { userId: "1", role: "admin" };

    const guard = {
      admin: AdminPolicies(context),
      post: PostPolicies(context),
    };

    expect(check(guard.post.policy("can edit comments"), { userId: "1", comments: [], status: "published" })).toBe(
      true
    );
    expect(check(guard.post.policy("can edit comments"), { userId: "2", comments: [], status: "published" })).toBe(
      true
    );

    expect(() =>
      assert(guard.post.policy("can edit comments"), { userId: "1", comments: [], status: "published" })
    ).not.toThrowError();
    expect(() =>
      assert(guard.post.policy("can edit comments"), { userId: "2", comments: [], status: "published" })
    ).not.toThrowError();
  });

  it("should define a policy set that returns a policy set factory", () => {
    type Context = { userId: string; rolesByOrg: Record<string, "user" | "admin"> };

    const orgPolicies = definePolicies((context: Context) => (orgId: string) => {
      const currentUserOrgRole = context.rolesByOrg[orgId];

      return [definePolicy("can administrate org", () => currentUserOrgRole === "admin")];
    });

    const context: Context = { userId: "1", rolesByOrg: { "it-department": "admin", "sales-team": "user" } };

    const guard = {
      org: orgPolicies(context),
    };

    expect(check(guard.org("it-department").policy("can administrate org"))).toBe(true);
    expect(check(guard.org("sales-team").policy("can administrate org"))).toBe(false);

    expect(() => assert(guard.org("it-department").policy("can administrate org"))).not.toThrowError();
    expect(() => assert(guard.org("sales-team").policy("can administrate org"))).toThrowError();
  });

  it("should work with resolved async params", async () => {
    // Note: This is just to demonstrate that we can mix async validation with policy conditions until TypeScript enables async type guards
    // https://github.com/microsoft/TypeScript/issues/37681
    // We need that to fully support async condition that still preserve inference
    type Context = { userId: string; rolesByOrg: Record<string, "user" | "admin"> };

    const orgPolicies = definePolicies((context: Context) => {
      return (orgId: string) => [
        definePolicy("can administrate org", (stillOrgAdmin: boolean) =>
          and(
            () => context.rolesByOrg[orgId] === "admin",
            () => stillOrgAdmin
          )
        ),
      ];
    });

    const context: Context = { userId: "1", rolesByOrg: { "it-department": "admin", "sales-team": "user" } };

    const guard = {
      org: orgPolicies(context),
    };

    // fake server check
    async function checkIfStillOrgAdmin(orgId: string) {
      return await Promise.resolve(orgId === "it-department");
    }

    expect(
      check(guard.org("it-department").policy("can administrate org"), await checkIfStillOrgAdmin("it-department"))
    ).toBe(true);
    expect(
      check(guard.org("sales-team").policy("can administrate org"), await checkIfStillOrgAdmin("sales-team"))
    ).toBe(false);
  });
});

describe("Inference", () => {
  it("should infer scalar from policy", () => {
    type Label = string | null;

    const guard = {
      input: definePolicies([definePolicy("not null", notNull)]),
    };

    const label: Label = "label";

    if (check(guard.input.policy("not null"), label)) {
      expect(label).not.toBeNull();
      expectTypeOf(label).toEqualTypeOf<string>();
    }

    expect(() => {
      assert(guard.input.policy("not null"), label);
      expect(label).not.toBeNull();
      expectTypeOf(label).toEqualTypeOf<string>();
    }).not.toThrowError();

    expect.assertions(3);
  });

  it("should infer scalar from implicit policy", () => {
    type Label = string | null;
    const label: Label = "label";

    if (check("not null", notNull, label)) {
      expect(label).not.toBeNull();
      expectTypeOf(label).toEqualTypeOf<string>();
    }

    expect(() => {
      assert("not null", notNull, label);
      expect(label).not.toBeNull();
      expectTypeOf(label).toEqualTypeOf<string>();
    }).not.toThrowError();

    expect.assertions(3);
  });

  it("should infer object from policy", () => {
    type Post = { userId: string; comments: string[]; status: "published" | "draft" | "archived" };

    const guard = {
      post: definePolicies([
        definePolicy(
          "published post",
          (post: Post): post is Post & { status: "published" } => post.status === "published"
        ),
      ]),
    };

    const post: Post = { userId: "1", comments: [], status: "published" };

    if (check(guard.post.policy("published post"), post)) {
      expect(post.status).toBe("published");
      expectTypeOf(post.status).toEqualTypeOf<"published">();
    }

    expect(() => {
      assert(guard.post.policy("published post"), post);
      expect(post.status).toBe("published");
      expectTypeOf(post.status).toEqualTypeOf<"published">();
    }).not.toThrowError();

    expect.assertions(3);
  });

  it("should infer object from implicit policy", () => {
    type Post = { userId: string; comments: string[]; status: "published" | "draft" | "archived" };

    const post: Post = { userId: "1", comments: [], status: "published" };

    // type predicate
    if (
      check("published post", (post: Post): post is Post & { status: "published" } => post.status === "published", post)
    ) {
      expect(post.status).toBe("published");
      expectTypeOf(post.status).toEqualTypeOf<"published">();
    }

    expect(() => {
      assert(
        "published post",
        (post: Post): post is Post & { status: "published" } => post.status === "published",
        post
      );
      expect(post.status).toBe("published");
      expectTypeOf(post.status).toEqualTypeOf<"published">();
    }).not.toThrowError();

    expect.assertions(3);
  });

  it("should infer a zod schema from a policy", () => {
    const PostSchema = z.object({
      userId: z.string(),
      comments: z.array(z.string()),
      status: z.union([z.literal("published"), z.literal("draft"), z.literal("archived")]),
    });
    type Post = z.infer<typeof PostSchema>;

    const guard = {
      post: definePolicies([
        definePolicy("published post", matchSchema(PostSchema.extend({ status: z.literal("published") }))),
      ]),
    };

    const post: Post = { userId: "1", comments: [], status: "published" };

    if (check(guard.post.policy("published post"), post)) {
      expect(post.status).toBe("published");
      expectTypeOf(post.status).toEqualTypeOf<"published">();
    }

    expect(() => {
      assert(guard.post.policy("published post"), post);
      expect(post.status).toBe("published");
      expectTypeOf(post.status).toEqualTypeOf<"published">();
    }).not.toThrowError();

    expect.assertions(3);
  });

  it("should infer a zod schema from an implicit policy", () => {
    const PostSchema = z.object({
      userId: z.string(),
      comments: z.array(z.string()),
      status: z.union([z.literal("published"), z.literal("draft"), z.literal("archived")]),
    });
    type Post = z.infer<typeof PostSchema>;

    const post: Post = { userId: "1", comments: [], status: "published" };

    if (check("published post", matchSchema(PostSchema.extend({ status: z.literal("published") })), post)) {
      expect(post.status).toBe("published");
      expectTypeOf(post.status).toEqualTypeOf<"published">();
    }

    expect(() => {
      assert("published post", matchSchema(PostSchema.extend({ status: z.literal("published") })), post);
      expect(post.status).toBe("published");
      expectTypeOf(post.status).toEqualTypeOf<"published">();
    }).not.toThrowError();

    expect.assertions(3);
  });

  it("should error if check is called with wrong signature", () => {
    // no condition arg
    expectTypeOf(check("policy", () => true)).toEqualTypeOf<boolean>();
    expectTypeOf(check(definePolicy("policy", () => true))).toEqualTypeOf<boolean>();

    // extra arg
    expectTypeOf(
      /**  @ts-expect-error */
      check("policy", () => true, {})
    ).toEqualTypeOf<boolean>();
    expectTypeOf(
      /**  @ts-expect-error */
      check(
        definePolicy("policy", () => true),
        {}
      )
    ).toEqualTypeOf<boolean>();

    // missing arg
    expectTypeOf(
      /**  @ts-expect-error */
      check("policy", (d: any) => d)
    ).toEqualTypeOf<boolean>();
    expectTypeOf(
      /**  @ts-expect-error */
      check(definePolicy("policy", (d: any) => d))
    ).toEqualTypeOf<boolean>();

    // missing arg type guard
    expectTypeOf(
      /**  @ts-expect-error */
      check("policy", (d: string | null): d is string => d)
    ).toEqualTypeOf<boolean>();
    expectTypeOf(
      /**  @ts-expect-error */
      check(definePolicy("policy", (d: string | null): d is string => d))
    ).toEqualTypeOf<boolean>();
  });

  it("should error if assert is called with wrong signature", () => {
    try {
      // no condition arg
      expectTypeOf(assert("policy", () => true)).toEqualTypeOf<void>();
      expectTypeOf(assert(definePolicy("policy", () => true))).toEqualTypeOf<void>();

      // extra arg
      expectTypeOf(
        /**  @ts-expect-error */
        assert("policy", () => true, {})
      ).toEqualTypeOf<void>();
      expectTypeOf(
        /**  @ts-expect-error */
        assert(
          definePolicy("policy", () => true),
          {}
        )
      ).toEqualTypeOf<void>();

      // missing arg
      expectTypeOf(
        /**  @ts-expect-error */
        assert("policy", (d: any) => d)
      ).toEqualTypeOf<void>();
      expectTypeOf(
        /**  @ts-expect-error */
        assert(definePolicy("policy", (d: any) => d))
      ).toEqualTypeOf<void>();

      // missing arg type guard
      expectTypeOf(
        /**  @ts-expect-error */
        assert("policy", (d: string | null): d is string => d)
      ).toEqualTypeOf<void>();
      expectTypeOf(
        /**  @ts-expect-error */
        assert(definePolicy("policy", (d: string | null): d is string => d))
      ).toEqualTypeOf<void>();
    } catch (e) {
      // We only test types here
    }
  });
});

describe("Logical operators", () => {
  type Context = { userId: string };
  type Post = { userId: string; comments: string[]; status: "published" | "draft" | "archived" };

  it("should [or] accept predicates", () => {
    const PostPolicies = definePolicies((context: Context) => {
      const myPostPolicy = definePolicy(
        "my post",
        (post: Post) => post.userId === context.userId,
        () => new Error("Not the author")
      );

      return [
        myPostPolicy,
        definePolicy("all published posts or mine", (post: Post) =>
          or(
            () => check(myPostPolicy, post),
            () => post.status === "published"
          )
        ),
      ];
    });

    const guard = {
      post: PostPolicies({ userId: "1" }),
    };

    expect(
      check(guard.post.policy("all published posts or mine"), { userId: "1", comments: [], status: "draft" })
    ).toBe(true);
    expect(
      check(guard.post.policy("all published posts or mine"), {
        userId: "2",
        comments: [],
        status: "published",
      })
    ).toBe(true);
    expect(
      check(guard.post.policy("all published posts or mine"), { userId: "2", comments: [], status: "draft" })
    ).toBe(false);

    expect(() =>
      assert(guard.post.policy("all published posts or mine"), { userId: "1", comments: [], status: "draft" })
    ).not.toThrowError();
    expect(() =>
      assert(guard.post.policy("all published posts or mine"), {
        userId: "2",
        comments: [],
        status: "published",
      })
    ).not.toThrowError();
    expect(() =>
      assert(guard.post.policy("all published posts or mine"), { userId: "2", comments: [], status: "draft" })
    ).toThrowError();
  });

  it("should [or] accept booleans", () => {
    const PostPolicies = definePolicies((context: Context) => {
      const myPostPolicy = definePolicy(
        "my post",
        (post: Post) => post.userId === context.userId,
        () => new Error("Not the author")
      );

      return [
        myPostPolicy,
        definePolicy("all published posts or mine", (post: Post) =>
          or(check(myPostPolicy, post), post.status === "published")
        ),
      ];
    });

    const guard = {
      post: PostPolicies({ userId: "1" }),
    };

    expect(
      check(guard.post.policy("all published posts or mine"), { userId: "1", comments: [], status: "draft" })
    ).toBe(true);
    expect(
      check(guard.post.policy("all published posts or mine"), {
        userId: "2",
        comments: [],
        status: "published",
      })
    ).toBe(true);
    expect(
      check(guard.post.policy("all published posts or mine"), { userId: "2", comments: [], status: "draft" })
    ).toBe(false);

    expect(() =>
      assert(guard.post.policy("all published posts or mine"), { userId: "1", comments: [], status: "draft" })
    ).not.toThrowError();
    expect(() =>
      assert(guard.post.policy("all published posts or mine"), {
        userId: "2",
        comments: [],
        status: "published",
      })
    ).not.toThrowError();
    expect(() =>
      assert(guard.post.policy("all published posts or mine"), { userId: "2", comments: [], status: "draft" })
    ).toThrowError();
  });

  it("should [and] accept predicates", () => {
    const PostPolicies = definePolicies((context: Context) => {
      const myPostPolicy = definePolicy(
        "my post",
        (post: Post) => post.userId === context.userId,
        () => new Error("Not the author")
      );

      return [
        myPostPolicy,
        definePolicy("all my published posts", (post: Post) =>
          and(
            () => check(myPostPolicy, post),
            () => post.status === "published"
          )
        ),
      ];
    });

    const guard = {
      post: PostPolicies({ userId: "1" }),
    };

    expect(check(guard.post.policy("all my published posts"), { userId: "1", comments: [], status: "published" })).toBe(
      true
    );
    expect(check(guard.post.policy("all my published posts"), { userId: "1", comments: [], status: "draft" })).toBe(
      false
    );
    expect(
      check(guard.post.policy("all my published posts"), {
        userId: "2",
        comments: [],
        status: "published",
      })
    ).toBe(false);

    expect(() =>
      assert(guard.post.policy("all my published posts"), { userId: "1", comments: [], status: "published" })
    ).not.toThrowError();
    expect(() =>
      assert(guard.post.policy("all my published posts"), { userId: "1", comments: [], status: "draft" })
    ).toThrowError();
    expect(() =>
      assert(guard.post.policy("all my published posts"), {
        userId: "2",
        comments: [],
        status: "published",
      })
    ).toThrowError();
  });

  it("should [and] accept booleans", () => {
    const PostPolicies = definePolicies((context: Context) => {
      const myPostPolicy = definePolicy(
        "my post",
        (post: Post) => post.userId === context.userId,
        () => new Error("Not the author")
      );

      return [
        myPostPolicy,
        definePolicy("all my published posts", (post: Post) =>
          and(check(myPostPolicy, post), post.status === "published")
        ),
      ];
    });

    const guard = {
      post: PostPolicies({ userId: "1" }),
    };

    expect(check(guard.post.policy("all my published posts"), { userId: "1", comments: [], status: "published" })).toBe(
      true
    );
    expect(check(guard.post.policy("all my published posts"), { userId: "1", comments: [], status: "draft" })).toBe(
      false
    );
    expect(
      check(guard.post.policy("all my published posts"), {
        userId: "2",
        comments: [],
        status: "published",
      })
    ).toBe(false);

    expect(() =>
      assert(guard.post.policy("all my published posts"), { userId: "1", comments: [], status: "published" })
    ).not.toThrowError();
    expect(() =>
      assert(guard.post.policy("all my published posts"), { userId: "1", comments: [], status: "draft" })
    ).toThrowError();
    expect(() =>
      assert(guard.post.policy("all my published posts"), {
        userId: "2",
        comments: [],
        status: "published",
      })
    ).toThrowError();
  });
});
