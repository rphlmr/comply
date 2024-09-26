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

type PolicyConditionNoArg = () => boolean;

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
    return this.condition(arg);
  }
}

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
            `[${name}] policy is not met for the argument: ${arg ? JSON.stringify(arg) : "<no value>"}`
          );
          error.name = name;
          return error;
        };

  return new Policy(name, condition, errorFactory);
}

/* -------------------------------------------------------------------------- */
/*                             Policies Registry;                             */
/* -------------------------------------------------------------------------- */

class PoliciesRegistry<
  TPolicies extends Policy<PolicyName, PolicyCondition>[],
  TPolicy extends TPolicies[number] = TPolicies[number],
  TPolicyName extends TPolicy["name"] = TPolicy["name"],
> {
  private readonly registry = {} as Record<TPolicyName, TPolicy>;

  constructor(policies: TPolicies) {
    for (const policy of policies) {
      this.registry[policy.name as TPolicyName] = policy as TPolicy;
    }
  }

  policy<TName extends TPolicyName>(name: TName): Extract<TPolicy, { name: TName }> {
    return this.registry[name] as Extract<TPolicy, { name: TName }>;
  }
}

type AnyPolicies = Policy<PolicyName, PolicyCondition>[];

type PoliciesFactory = (...args: any[]) => AnyPolicies;

type PoliciesOrFactory = AnyPolicies | PoliciesFactory;

type PoliciesRegistryOrFactory<T extends PoliciesOrFactory> = T extends AnyPolicies
  ? PoliciesRegistry<T>
  : T extends PoliciesFactory
    ? (...args: Parameters<T>) => PoliciesRegistry<ReturnType<T>>
    : never;

/**
 * Creates a policy group without context.
 * @param {() => T} define - A function that returns policies registry or a policies registry factory
 */
export function definePolicies<T extends PoliciesOrFactory>(define: () => T): () => PoliciesRegistryOrFactory<T>;

/**
 * Creates a policy group with an optional context.
 * @param {(context?: Context) => T} define - A function that takes an optional context and returns policies registry or a policies registry factory
 */
export function definePolicies<T extends PoliciesOrFactory, Context = undefined>(
  define: (context?: Context) => T
): (context?: Context) => PoliciesRegistryOrFactory<T>;

/**
 * Creates a policy group with a required context.
 * @param define - A function that takes a context and returns policies registry or a policies registry factory
 */
export function definePolicies<T extends PoliciesOrFactory, Context>(
  define: (context: Context) => T
): (context: Context) => PoliciesRegistryOrFactory<T>;

/**
 * Implementation
 */
export function definePolicies<T extends PoliciesOrFactory, Context = undefined>(define: (context?: Context) => T) {
  return (context?: Context) => {
    const policiesOrFactory = define(context);

    if (typeof policiesOrFactory === "function") {
      return (...args: any[]) => new PoliciesRegistry(policiesOrFactory(...args));
    }

    return new PoliciesRegistry(policiesOrFactory);
  };
}

export function or(
  ...predicates: (() => Policy<PolicyName, PolicyCondition, PolicyConditionArg<PolicyCondition>> | boolean)[]
) {
  return predicates.some((predicate) => predicate());
}

export function and(
  ...predicates: (() => Policy<PolicyName, PolicyCondition, PolicyConditionArg<PolicyCondition>> | boolean)[]
) {
  return predicates.every((predicate) => predicate());
}

/* -------------------------------------------------------------------------- */
/*                                   Guards;                                  */
/* -------------------------------------------------------------------------- */

export function assert<TPolicyCondition extends PolicyConditionNoArg>(
  policy: Policy<PolicyName, TPolicyCondition, PolicyErrorFactory>
): void;
export function assert<TPolicyCondition extends PolicyConditionTypeGuard<any> | PolicyConditionWithArg<any>>(
  policy: Policy<PolicyName, TPolicyCondition, PolicyErrorFactory>,
  arg: TPolicyCondition extends PolicyConditionNoArg ? never : PolicyConditionArg<TPolicyCondition>
): asserts arg is TPolicyCondition extends PolicyConditionNoArg
  ? never
  : PolicyConditionTypeGuardResult<TPolicyCondition>;
export function assert<TPolicyCondition extends PolicyCondition>(
  policy: Policy<PolicyName, TPolicyCondition, PolicyErrorFactory>,
  arg?: any
): void {
  if (policy.condition(arg)) {
    return;
  }

  throw policy.errorFactory(arg);
}

export function check<TPolicyCondition extends PolicyConditionNoArg>(
  policy: Policy<PolicyName, TPolicyCondition>
): boolean;
export function check<TPolicyCondition extends PolicyConditionTypeGuard<any> | PolicyConditionWithArg<any>>(
  policy: Policy<PolicyName, TPolicyCondition>,
  arg: TPolicyCondition extends PolicyConditionNoArg ? never : PolicyConditionArg<TPolicyCondition>
): arg is TPolicyCondition extends PolicyConditionNoArg ? never : PolicyConditionTypeGuardResult<TPolicyCondition>;
export function check<TPolicyCondition extends PolicyCondition>(
  policy: Policy<PolicyName, TPolicyCondition>,
  arg?: any
): boolean {
  return policy.condition(arg);
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers;                                  */
/* -------------------------------------------------------------------------- */

export function complyWithSchema<Schema extends z.ZodType>(schema: Schema) {
  return (value: unknown): value is z.infer<Schema> => schema.safeParse(value).success;
}

export function notNull(v: unknown | null | undefined): v is NonNullable<typeof v> {
  return v != null;
}
