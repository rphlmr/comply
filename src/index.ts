import type { z } from "zod";

/* -------------------------------------------------------------------------- */
/*                                   Policy;                                  */
/* -------------------------------------------------------------------------- */

type PolicyError = Error;

type PolicyErrorFactory<T extends PolicyError = PolicyError> = (arg: unknown) => T;

type PolicyConditionWithArg<T = any> = (arg: T) => boolean;

type PolicyConditionArg<P extends PolicyCondition> = P extends PolicyConditionWithArg<infer T> ? T : never;

type PolicyConditionTypeGuard<T = any, U extends T = T> = (arg: T) => arg is U;

type PolicyConditionTypeGuardResult<P extends PolicyCondition> = P extends PolicyConditionTypeGuard<any, infer U>
  ? U
  : PolicyConditionArg<P>;

type PolicyConditionNoArg = (() => boolean) | boolean;

type PolicyCondition<T = any, U extends T = T> =
  | PolicyConditionTypeGuard<T, U>
  | PolicyConditionWithArg<T>
  | PolicyConditionNoArg;

type PolicyName = string;

class Policy<
  TPolicyName extends PolicyName,
  TPolicyCondition extends PolicyCondition,
  TPolicyErrorFactory extends PolicyErrorFactory = PolicyErrorFactory,
  TPolicyConditionArg = PolicyConditionArg<TPolicyCondition>,
  TResult extends TPolicyConditionArg = PolicyConditionTypeGuardResult<TPolicyCondition>,
> {
  constructor(
    readonly name: TPolicyName,
    readonly condition: TPolicyCondition,
    readonly errorFactory: TPolicyErrorFactory
  ) {
    this.name = name;
    this.condition = condition;
    this.errorFactory = errorFactory;
  }

  // assert(
  //   arg: TPolicyCondition extends PolicyConditionNoArg ? void : TPolicyConditionArg
  // ): asserts arg is TPolicyCondition extends PolicyConditionNoArg ? void : TResult {
  //   if (!this.condition(arg)) {
  //     throw this.errorFactory(arg);
  //   }
  // }

  check(
    arg: TPolicyCondition extends PolicyConditionNoArg ? void : TPolicyConditionArg
  ): arg is TPolicyCondition extends PolicyConditionNoArg ? void : TResult {
    return typeof this.condition === "boolean" ? this.condition : this.condition(arg);
  }
}

/**
 * Define a policy
 *
 * @param name - The name of the policy
 * @param condition - The condition that the policy checks
 * @param errorFactoryOrMessage - The error factory or message of the policy
 *
 * @example
 * ```ts
  const postHasCommentsPolicy = definePolicy(
    "post has comments",
    (post: Post) => post.comments.length > 0,
    () => new Error("Post has no comments")
  );
 * ```
 */
export function definePolicy<
  TPolicyName extends PolicyName,
  TPolicyCondition extends PolicyCondition,
  TPolicyErrorFactory extends PolicyErrorFactory = PolicyErrorFactory,
>(name: TPolicyName, condition: TPolicyCondition, errorFactoryOrMessage?: TPolicyErrorFactory | string) {
  const errorFactory =
    typeof errorFactoryOrMessage === "function"
      ? errorFactoryOrMessage
      : (arg: unknown) => {
          const error = new Error(
            errorFactoryOrMessage ||
              `[${name}] policy is not met for the argument: ${arg ? JSON.stringify(arg) : "<no value>"}`
          );
          error.name = `PolicyRejection: [${name}]`;
          return error;
        };

  return new Policy(name, condition, errorFactory);
}

/* -------------------------------------------------------------------------- */
/*                                 Policy Set;                                */
/* -------------------------------------------------------------------------- */

class PolicySet<
  TPolicies extends Policy<PolicyName, PolicyCondition>[],
  TPolicy extends TPolicies[number] = TPolicies[number],
  TPolicyName extends TPolicy["name"] = TPolicy["name"],
> {
  private readonly set = {} as Record<TPolicyName, TPolicy>;

  constructor(policies: TPolicies) {
    for (const policy of policies) {
      this.set[policy.name as TPolicyName] = policy as TPolicy;
    }
  }

  policy<TName extends TPolicyName>(name: TName): Extract<TPolicy, { name: TName }> {
    return this.set[name] as Extract<TPolicy, { name: TName }>;
  }
}

type AnyPolicy = Policy<PolicyName, PolicyCondition>;

type AnyPolicies = AnyPolicy[];

type PolicyFactory = (...args: any[]) => AnyPolicies;

type PoliciesOrFactory = AnyPolicies | PolicyFactory;

type PolicySetOrFactory<T extends PoliciesOrFactory> = T extends AnyPolicies
  ? PolicySet<T>
  : T extends PolicyFactory
    ? (...args: Parameters<T>) => PolicySet<ReturnType<T>>
    : never;

type WithRequiredArg<T> = T extends (arg: infer A) => any ? (unknown extends A ? never : T) : never;

/**
 * Create a set of policies
 *
 * @param policies - Policies to be added to the set
 *
 * @example
 *
 * ```ts
  // define a policy set
  const Guard = () => ({
    post: definePolicies([
      definePolicy("post has comments", (post: Post) => post.comments.length > 0),
      // unlock type inference with type guards 👇
      definePolicy("post is draft", (post: Post) => post.status === "draft"),
    ]),
  });

  const guard = Guard();

  // use it
  if (check(guard.post.policy("post has comments"), post)) {
    // post has comments
  }

  if (check(guard.post.policy("post is draft"), post)) {
    // post.status === "draft" + inferred type
  }

  assert(guard.post.policy("post has comments"), post); // throws if the condition is not met
  // post has comments
 * ```
 */
export function definePolicies<T extends AnyPolicies>(policies: T): PolicySet<T>;

/**
 * Create a set of policies from a factory function which takes a `context` argument.
 *
 * The factory function should return a policy set or a policy set factory.
 *
 * @param define - A function that takes a context and returns a policy set or a policy set factory
 *
 * @example
 * **Returns a policy set**
 * ```ts
 * // define a policy set
  const PostPolicies = definePolicies((context: Context) => [
    definePolicy(
      "my post",
      (post: Post) => post.userId === context.userId,
    ),
  ]);

  const Guard = () => ({
    post: PostPolicies(context),
  });

  const guard = Guard();

  // use it
  if (check(guard.post.policy("my post"), post)) {
    // post.userId === context.userId
  }

  assert(guard.post.policy("my post"), post); // throws if the condition is not met
  // post.userId === context.userId
 * ```
 * **Returns a policy set factory**
 * ```ts
 * // define a policy set
  const PostPolicies = definePolicies((context: Context) => {
    return (orgId: string) => [
      definePolicy("can administrate org", () => context.rolesByOrg[orgId] === "admin"),
    ];
  });

  const Guard = () => ({
    org: PostPolicies(context),
  });

  // use it
  if (check(guard.org("it-department").policy("can administrate org"))) {
    // context.rolesByOrg["it-department"] === "admin"
  }

  assert(guard.org("it-department").policy("can administrate org")); // throws if the condition is not met
  // context.rolesByOrg["it-department"] === "admin"
 * ```
 */
export function definePolicies<Context, T extends PoliciesOrFactory>(
  define: WithRequiredArg<(context: Context) => T>
): (context: Context) => PolicySetOrFactory<T>;

export function definePolicies<Context, T extends PoliciesOrFactory>(defineOrPolicies: T | ((context: Context) => T)) {
  if (Array.isArray(defineOrPolicies)) {
    return new PolicySet(defineOrPolicies);
  }

  return (context: Context) => {
    const policiesOrFactory = defineOrPolicies(context);

    if (typeof policiesOrFactory === "function") {
      return (...args: any[]) => new PolicySet(policiesOrFactory(...args));
    }

    return new PolicySet(policiesOrFactory);
  };
}

/**
 * Logical OR operator for policy conditions.
 *
 * At least one of the policies or conditions must be met for the result to be true
 *
 * @example
 * ```ts
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
    post: PostPolicies(context),
  };

  if (check(guard.post.policy("all published posts or mine"), post)) {
    // post.status === "published" || post.userId === context.userId && post.status === "published" | ...
  }

  assert(guard.post.policy("all published posts or mine"), post); // throws if the condition is not met
  // post.status === "published" || post.userId === context.userId && post.status === "published" | ...
 *```
 */
export function or(
  ...conditions: (
    | (() => Policy<PolicyName, PolicyCondition, PolicyConditionArg<PolicyCondition>> | boolean)
    | boolean
  )[]
) {
  return conditions.some((predicate) => (typeof predicate === "function" ? predicate() : predicate));
}

/**
 * Logical AND operator for policy conditions.
 *
 * All the policies or conditions must be met for the result to be true
 *
 * @example
 * ```ts
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

  const guard = {
    post: PostPolicies(context),
  };

  if (check(guard.post.policy("my published post"), post)) {
    // post.status === "published" && post.userId === context.userId
  }

  assert(guard.post.policy("my published post"), post); // throws if the condition is not met
  // post.status === "published" && post.userId === context.userId
 *```
 */
export function and(
  ...conditions: (
    | (() => Policy<PolicyName, PolicyCondition, PolicyConditionArg<PolicyCondition>> | boolean)
    | boolean
  )[]
) {
  return conditions.every((predicate) => (typeof predicate === "function" ? predicate() : predicate));
}

/* -------------------------------------------------------------------------- */
/*                                   Guards;                                  */
/* -------------------------------------------------------------------------- */

/* --------------------------------- Assert; -------------------------------- */

/**
 * Assert an implicit policy with a no-arg condition function (lazy evaluation) or a boolean value
 *
 * @param name - The name of the policy
 * @param condition - The condition to assert (no-arg) or a boolean value
 *
 * @example
 * ```ts
 * const post = await getPost(id);
 *
 * // lazy evaluation
 * assert("post has comments", () => post.comments.length > 0);
 *
 * // boolean value
 * assert("post has comments", post.comments.length > 0);
 * ```
 */
export function assert(name: string, condition: PolicyConditionNoArg): void;

/**
 * Assert an implicit policy with a condition function that takes an argument (lazy evaluation) or a boolean value
 *
 * The condition function can be a type guard or a predicate
 *
 * @param name - The name of the policy
 * @param condition - The condition to assert (with arg) or a boolean value
 * @param arg - The argument to pass to the condition
 *
 * @example
 * ```ts
 * // lazy evaluation
 * assert("post has comments", (post: Post) => post.comments.length > 0, await getPost(id));
 *
 * // type guard
 * assert("post is draft", (post: Post): post is Post & { status: "draft" } => post.status === "draft", await getPost(id));
 *
 * // boolean value
 * assert("post has comments",(await getPost(id)).comments.length > 0);
 * ```
 */
export function assert<TPolicyCondition extends PolicyConditionTypeGuard<any> | PolicyConditionWithArg<any>>(
  name: string,
  condition: TPolicyCondition,
  arg: TPolicyCondition extends PolicyConditionNoArg ? never : PolicyConditionArg<TPolicyCondition>
): asserts arg is TPolicyCondition extends PolicyConditionNoArg
  ? never
  : PolicyConditionTypeGuardResult<TPolicyCondition>;

/**
 * Assert a policy with a no-arg condition function (lazy evaluation) or a boolean value
 *
 * @param policy - The policy to assert or a boolean value
 *
 * @example
 * ```ts
 * const AdminPolicies = definePolicies((context: Context) => [
 *  definePolicy("is admin", context.role === "admin"),
 *  // lazy evaluation
 *   definePolicy("is admin", () => context.role === "admin"),
 * ]);
 *
 * const Guard = (context: Context) => ({
 *   admin: AdminPolicies(context),
 * });
 *
 * assert(guard.admin.policy("is admin"));
 * ```
 */
export function assert<TPolicyCondition extends PolicyConditionNoArg>(
  policy: Policy<PolicyName, TPolicyCondition, PolicyErrorFactory>
): void;

/**
 * Assert a policy with a condition function that takes an argument
 *
 * The condition function can be a type guard or a predicate
 *
 * @param policy - The policy to assert
 * @param arg - The argument to pass to the condition
 *
 * @example
 * ```ts
 * const PostPolicies = definePolicies((context: Context) => [
 *   definePolicy("is author", (post: Post) => post.userId === context.userId),
 * ]);
 *
 * const Guard = (context: Context) => ({
 *   post: PostPolicies(context),
 * });
 *
 * assert(guard.post.policy("is author"), post);
 * ```
 */
export function assert<TPolicyCondition extends PolicyConditionTypeGuard<any> | PolicyConditionWithArg<any>>(
  policy: Policy<PolicyName, TPolicyCondition, PolicyErrorFactory>,
  arg: TPolicyCondition extends PolicyConditionNoArg ? never : PolicyConditionArg<TPolicyCondition>
): asserts arg is TPolicyCondition extends PolicyConditionNoArg
  ? never
  : PolicyConditionTypeGuardResult<TPolicyCondition>;

/**
 * Implementation of the assert function
 */
export function assert<TPolicyCondition extends PolicyCondition>(
  policyOrName: Policy<PolicyName, TPolicyCondition, PolicyErrorFactory> | string,
  ...args: any[]
): void {
  let policy: AnyPolicy;
  let arg: any;

  if (typeof policyOrName === "string") {
    policy = definePolicy(policyOrName, args[0]);
    arg = args[1];
  } else {
    policy = policyOrName;
    arg = args[0];
  }

  if (typeof policy.condition === "boolean" ? policy.condition : policy.condition(arg)) {
    return;
  }

  throw policy.errorFactory(arg);
}

/* --------------------------------- Check; --------------------------------- */

/**
 * Check an implicit policy with a no-arg condition function or a boolean value
 *
 * @param name - The name of the policy
 * @param condition - The condition to check (no-arg) or a boolean value
 *
 * @example
 * ```ts
 * const post = await getPost(id);
 *
 * // lazy evaluation
 * if (check("post has comments", () => post.comments.length > 0)) {
 *   // post has comments
 * }
 *
 * // boolean value
 * if (check("post has comments", post.comments.length > 0)) {
 *   // post has comments
 * }
 * ```
 */
export function check(name: string, condition: PolicyConditionNoArg): boolean;

/**
 * Check an implicit policy with a condition function that takes an argument
 *
 * The condition function can be a type guard or a predicate
 *
 * @param name - The name of the policy
 * @param condition - The condition to check (with arg)
 * @param arg - The argument to pass to the condition
 *
 * @example
 * ```ts
 * if (check("post has comments", (post: Post) => post.comments.length > 0, post)) {
 *   // post has comments
 * }
 *
 * // type guard
 * if (check("post is draft", (post: Post): post is Post & { status: "draft" } => post.status === "draft", post)) {
 *   // post.status === "draft"
 * }
 * ```
 */
export function check<TPolicyCondition extends PolicyConditionTypeGuard<any> | PolicyConditionWithArg<any>>(
  name: string,
  condition: TPolicyCondition,
  arg: TPolicyCondition extends PolicyConditionNoArg ? never : PolicyConditionArg<TPolicyCondition>
): arg is TPolicyCondition extends PolicyConditionNoArg ? never : PolicyConditionTypeGuardResult<TPolicyCondition>;

/**
 * Check a policy with a no-arg condition function
 *
 * @param policy - The policy to check
 *
 * @example
 * ```ts
 * const AdminPolicies = definePolicies((context: Context) => [
 *   definePolicy("is admin", () => context.role === "admin"),
 * ]);
 *
 * const Guard = (context: Context) => ({
 *   admin: AdminPolicies(context),
 * });
 *
 * if (check(guard.admin.policy("is admin"))) {
 *   // ...
 * }
 * ```
 */
export function check<TPolicyCondition extends PolicyConditionNoArg>(
  policy: Policy<PolicyName, TPolicyCondition>
): boolean;

/**
 * Check a policy with a condition function that takes an argument
 *
 * The condition function can be a type guard or a predicate
 *
 * @param policy - The policy to check
 * @param arg - The argument to pass to the condition
 *
 * @example
 * ```ts
 * const PostPolicies = definePolicies((context: Context) => [
 *   definePolicy("is author", (post: Post) => post.userId === context.userId),
 * ]);
 *
 * const Guard = (context: Context) => ({
 *   post: PostPolicies(context),
 * });
 *
 * if (check(guard.post.policy("is author"), post)) {
 *   // ...
 * }
 * ```
 */
export function check<TPolicyCondition extends PolicyConditionTypeGuard<any> | PolicyConditionWithArg<any>>(
  policy: Policy<PolicyName, TPolicyCondition>,
  arg: TPolicyCondition extends PolicyConditionNoArg ? never : PolicyConditionArg<TPolicyCondition>
): arg is TPolicyCondition extends PolicyConditionNoArg ? never : PolicyConditionTypeGuardResult<TPolicyCondition>;

/**
 * Implementation of the check function
 */
export function check<TPolicyCondition extends PolicyCondition>(
  policyOrName: Policy<PolicyName, TPolicyCondition> | string,
  ...args: any[]
): boolean {
  let policy: AnyPolicy;
  let arg: any;

  if (typeof policyOrName === "string") {
    policy = definePolicy(policyOrName, args[0]);
    arg = args[1];
  } else {
    policy = policyOrName;
    arg = args[0];
  }

  return typeof policy.condition === "boolean" ? policy.condition : policy.condition(arg);
}

type PolicyTuple =
  | readonly [string, PolicyConditionNoArg]
  | readonly [Policy<string, PolicyConditionNoArg>]
  | readonly [Policy<string, PolicyConditionWithArg>, any];

type InferPolicyName<TPolicyTuple> = TPolicyTuple extends readonly [infer name, any]
  ? name extends Policy<infer Name, any>
    ? Name
    : name extends string
      ? name
      : never
  : TPolicyTuple extends readonly [Policy<infer Name, any>]
    ? Name
    : never;

type PoliciesSnapshot<TPolicyName extends string> = { [K in TPolicyName]: boolean };

/**
 * Create a snapshot of policies and their evaluation results
 *
 * It evaluates all the policies with `check`
 *
 * @param policies - A tuple of policies and their arguments (if needed)
 *
 * @example
 * ```ts
 * // TLDR
   const snapshot = checkAllSettle([
    [guard.post.policy("my post"), post],
    [guard.post.policy("all my published posts"), post],
    ["post has comments", post.comments.length > 0],
  ]);

  // returns: { "my post": boolean; "all my published posts": boolean; "post has comments": boolean; }

 * // Example
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
    post: PostPolicies(context),
  };

  const snapshot = checkAllSettle([
    [guard.post.policy("my post"), post],
    [guard.post.policy("all my published posts"), post],
    ["post has comments", post.comments.length > 0],
  ]);

  console.log(snapshot); // { "my post": boolean; "all my published posts": boolean; "post has comments": boolean; }
 * ```
 */
export function checkAllSettle<
  const TPolicies extends readonly PolicyTuple[],
  TPolicyTuple extends TPolicies[number],
  TPolicyName extends InferPolicyName<TPolicyTuple>,
>(policies: TPolicies): PoliciesSnapshot<TPolicyName> {
  return policies.reduce(
    (acc, policyTuple) => {
      const [policyOrName, arg] = policyTuple;
      const policyName = typeof policyOrName === "string" ? policyOrName : policyOrName.name;

      acc[policyName as TPolicyName] =
        typeof policyOrName === "string" ? (typeof arg === "function" ? arg() : arg) : policyOrName.check(arg);

      return acc;
    },
    {} as PoliciesSnapshot<TPolicyName>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers;                                  */
/* -------------------------------------------------------------------------- */

/**
 * Match a value against a schema
 *
 * @param schema - The schema to match against (type guard)
 *
 * @example
 * ```ts
 * if (check("params are valid", matchSchema(z.object({ id: z.string() })), params)) {
 *   // params is { id: string }
 * }
 * ```
 */
export function matchSchema<Schema extends z.ZodType>(schema: Schema) {
  return (value: unknown): value is z.infer<Schema> => schema.safeParse(value).success;
}

/**
 * Check if a value is not null (type guard)
 *
 * @param v - The value to check
 *
 * @example
 * ```ts
 * const value: string | null = "hello";
 *
 * if (check("value is not null", notNull, value)) {
 *   // value is not null
 * }
 * ```
 */
export function notNull(v: unknown | null | undefined): v is NonNullable<typeof v> {
  return v != null;
}
