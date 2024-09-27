# Comply

![GitHub Repo stars](https://img.shields.io/github/stars/rphlmr/comply?style=social)
![npm](https://img.shields.io/npm/v/comply?style=plastic)
![GitHub](https://img.shields.io/github/license/rphlmr/comply?style=plastic)
![npm](https://img.shields.io/npm/dy/comply?style=plastic)
![npm](https://img.shields.io/npm/dw/comply?style=plastic)
![GitHub top language](https://img.shields.io/github/languages/top/rphlmr/comply?style=plastic)

This library provides a simple way to define and enforce policies within your application. Policies are defined as a set of rules that determine whether a specific action can be performed based on a given context.

The API surface is small:
- `definePolicy`: Define a policy, the core primitive
- `definePolicies`: Define a policy set (a collection of policies created with `definePolicy`)
- `check`: Test a policy condition
- `assert`: Assert a policy condition (throws if condition is not met)

## TLDR
### Define policies
```typescript
// somewhere in your app
type MyContext = { userId: string; rolesByOrg: Record<string, "user" | "admin" | "superadmin"> };
```
```typescript
// define all your policies
import { z } from 'zod';
import { matchSchema, notNull, definePolicy, definePolicies, check, assert, or } from 'comply';

const OrgPolicies = definePolicies((context: MyContext) => (orgId: string) => {
  const currentUserOrgRole = context.rolesByOrg[orgId];

  return [
    definePolicy("can administrate", () =>
      or(
        () => currentUserOrgRole === "admin",
        () => currentUserOrgRole === "superadmin"
      )
    ),
    definePolicy("is superadmin", () => currentUserOrgRole === "superadmin"),
  ];
});

const UserPolicies = definePolicies((context: MyContext) => (userId: string) => [
  definePolicy("can edit profile", () => context.userId === userId),
]);

const ParamsPolicies = definePolicies([
  definePolicy("is not null", notNull),
  definePolicy("is a string", (v: unknown): v is string => typeof v === "string"),
  definePolicy('route x params are valid', matchSchema(z.object({ name: z.string() })))
]);

// create and export a 'guard' that contains all your policies, scoped by domain
export const Guard = (context: MyContext) => ({
  org: OrgPolicies(context),
  user: UserPolicies(context),
  params: ParamsPolicies,
});
```

### Use policies
```typescript
// use - example with Remix Run
import { matchSchema, notNull, definePolicy, definePolicies, check, assert } from 'comply';

// route: /orgs/:orgId
const ParamsSchema = z.object({ orgId: z.string() });

export function loader({ request, context, params }: LoaderFunctionArgs) {
  const guard = Guard(context);

  // define an implicit policy on the fly!
  assert("params are valid", matchSchema(ParamsSchema), params);
    // params is now typed as { orgId: string }


  //                     👇 type-safe               👇 type-safe
  if (check(guard.org(params.orgId).policy("can administrate"))) {
    console.log("User can administrate the IT department.");
  } else {
    console.log("User cannot administrate the IT department.");
  }

  assert(guard.org(params.orgId).policy("can administrate"));
  // context.rolesByOrg[params.orgId] === "admin"
  // otherwise it throws an error
}
```

### Type-safe all the way

Accessing policies by name from policy sets is type-safe.

For example, with `guard.org(params.orgId).policy("can administrate")`, `"can administrate"` will be suggested by Typescript.

If the condition requires a parameter, `assert` and `check` will require it.

Finally, if the condition is a type guard, the parameter you pass will be inferred automatically.

## Defining Policies
To define policies, you create a policy set using the `definePolicies` function.
Each policy definition is created using the `definePolicy` function, which takes a policy name and a callback that defines the policy logic.
The callback logic can receive a unique parameter (scalar or object) and return a boolean value or a a type predicate.

You can also provide an error factory to the policy (3rd argument) to customize the error message.

`definePolicies` returns a policy set (a collection of policies you can invoke with `.policy("name")`) or a policy set factory (a function that takes a parameter and returns a policy set).

You can then use this set to check if a condition is met and/or assert it with `check` and `assert`.

### Simple policy set
`definePolicies` accepts an array of policies created with `definePolicy`.

_Primary use case_: simple policies that can be defined inline and are 'self-contained' (don't need a context or a factory).

```typescript
const policies = definePolicies([
  definePolicy("is not null", notNull),
  definePolicy("is a string", (v: unknown): v is string => typeof v === "string"),
  definePolicy('comply with schema', complyWithSchema(z.object({ name: z.string() })))
]);
```

### Advanced policy set
`definePolicies` can take a callback that receives a context (whatever you want to pass to your policies) and returns a policy set or a policy set factory.

A policy set factory is a function that takes a parameter (scalar or object) and returns a policy set.

The primary purpose of this is to simplify the definition of policies that depend on a parameter (e.g. a userId, orgId, etc.).

Here's a quick example:
```typescript
// 1️⃣
type Context = { userId: string; rolesByOrg: Record<string, "user" | "admin" | "superadmin"> };

const AdminPolicies = definePolicies((context: Context) => [
  definePolicy("has admin role", () => context.role === "admin"),
]);

// 2️⃣
const OrgPolicies = definePolicies((context: MyContext) => (orgId: string) => {
  const adminGuard = AdminPolicies(context);
  const currentUserOrgRole = context.rolesByOrg[orgId];

  return [
    definePolicy("can administrate", () =>
      or(
        () => currentUserOrgRole === "admin",
        () => currentUserOrgRole === "superadmin",
        () => check(adminGuard.policy("has admin role"))
    ),
    definePolicy("is superadmin", () => currentUserOrgRole === "superadmin"),
  ];
});

// other policies...

// 3️⃣
// create and export a 'guard' that contains all your policies, scoped by domain
export const Guard = (context: Context) => ({
  org: OrgPolicies(context),
});
```
Let's break it down:

### 1️⃣
We define a context type that includes the necessary information for our policies.

It's up to you what you put in it, depending on what framework you're using and what information you need in your policies.

### 2️⃣
We create a policy set factory that takes a `orgId` and returns a policy set.

This way, we can 'scope' our policies to a specific organization and benefit from the closure feature (all policies share the same `currentUserOrgRole` variable).

We also can invoke other policy sets factories (e.g. `AdminPolicies`) and compose new policies.

### 3️⃣
We create and export a `Guard` function (arbitrary name) that takes a context and returns an object containing all our policies.

We choose to scope our policies by domain (e.g. `org`, `user`, `params`, etc.) to avoid conflicts and make the code more organized.


## Using Policies

To use your policies, invoke the `Guard` factory with the context and then use the returned object to access your policies.

Here's an example with a Remix Run loader but it works the same with any other framework.
```typescript
import { matchSchema, notNull, definePolicy, definePolicies, check, assert } from 'comply';

// route: /orgs/:orgId
const ParamsSchema = z.object({ orgId: z.string() });

export function loader({ request, context, params }: LoaderFunctionArgs) {
  const guard = Guard(context);

  // 1️⃣ define an implicit policy on the fly!
  assert("params are valid", matchSchema(ParamsSchema), params)
  // params is now typed as { orgId: string }

  // 2️⃣                     👇 type-safe               👇 type-safe
  if (check(guard.org(params.orgId).policy("can administrate"))) {
    console.log("User can administrate the IT department.");
  } else {
    console.log("User cannot administrate the IT department.");
  }

  // 3️⃣
  assert(guard.org(params.orgId).policy("can administrate"))
  // context.rolesByOrg[params.orgId] === "admin"
  // otherwise it throws an error
}
```
Let's break it down:

### 1️⃣
Just to demonstrate that we can, we define an implicit policy on the fly!

It's a quick way to name an assert/check in your code flow.

It works the same for `check` and it's equivalent to defining a policy with `definePolicy`.

### 2️⃣
We use `check` and pass it the policy we want to evaluate. We are telling a story here: "check if the user can administrate this specific organization".

### 3️⃣
We use `assert` to assert a policy condition. It passes or it throws an error.


## Async Policy Evaluation

The library does not support async policy evaluation because TypeScript does not support async type guards. (https://github.com/microsoft/TypeScript/issues/37681).

Of course, we can use async check but not directly in policy conditions.

Here's an example:
```typescript
type Context = { userId: string; rolesByOrg: Record<string, "user" | "admin"> };

const OrgPolicies = definePolicies((context: Context) => (orgId: string) => [
  definePolicy("can administrate org", (stillOrgAdmin: boolean) =>
    and(
      () => context.rolesByOrg[orgId] === "admin",
      () => stillOrgAdmin
    )
  ),
]);

// fake server check
async function checkIfStillOrgAdmin(orgId: string, userId: string) {
  // ...
}

  // route: /orgs/:orgId
const ParamsSchema = z.object({ orgId: z.string() });

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const guard = Guard(context);

  assert("params are valid", matchSchema(ParamsSchema), params)

  assert(guard.org(params.orgId).policy("can administrate org"), await checkIfStillOrgAdmin(params.orgId, context.userId))
}
```
In this example, our policy condition requires a parameter (`stillOrgAdmin`, boolean, but can be any type).

Then we use inversion of control to pass the parameter to the policy condition.

This is not what I really want, but it's a temporary limitation we have to live with until TypeScript implements async type guards.

I prefer to preserve the type guard/inference benefits of `assert` and `check` instead of supporting async policy conditions.

## API
### `definePolicy`
Core primitive to define a policy.

```typescript
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

function definePolicy(name: string, condition: PolicyCondition, errorFactory?: PolicyErrorFactory)
```

Example:
```ts
const postHasCommentsPolicy = definePolicy(
  "post has comments",
  (post: Post) => post.comments.length > 0,
  () => new Error("Post has no comments")
);
```

### `definePolicies`
Core primitive to define a policy set (collection of policies).


```typescript
function definePolicies<T extends AnyPolicies>(policies: T): PolicySet<T>;

type AnyPolicy = Policy<PolicyName, PolicyCondition>;
type AnyPolicies = AnyPolicy[];
type PolicyFactory = (...args: any[]) => AnyPolicies;
type PoliciesOrFactory = AnyPolicies | PolicyFactory;
type PolicySetOrFactory<T extends PoliciesOrFactory> = T extends AnyPolicies
  ? PolicySet<T>
  : T extends PolicyFactory
    ? (...args: Parameters<T>) => PolicySet<ReturnType<T>>
    : never;
type WithRequiredContext<T> = T extends (arg: infer A) => any ? (unknown extends A ? never : T) : never;

function definePolicies<Context, T extends PoliciesOrFactory>(
  define: WithRequiredContext<(context: Context) => T>
): (context: Context) => PolicySetOrFactory<T>;
```
Example:
```ts
const PostPolicies = definePolicies((context: Context) => [
  definePolicy("post has comments", (post: Post) => post.comments.length > 0),
  definePolicy("is author", (post: Post) => post.authorId === context.userId)
]);

export const Guard = (context: Context) => ({
  post: PostPolicies(context),
});
```

### `assert`
```typescript
function assert(name: string, condition: PolicyConditionNoArg): void;

function assert<TPolicyCondition extends PolicyConditionTypeGuard<any> | PolicyConditionWithArg<any>>(
  name: string,
  condition: TPolicyCondition,
  arg: TPolicyCondition extends PolicyConditionNoArg ? never : PolicyConditionArg<TPolicyCondition>
): asserts arg is TPolicyCondition extends PolicyConditionNoArg
  ? never
  : PolicyConditionTypeGuardResult<TPolicyCondition>;

function assert<TPolicyCondition extends PolicyConditionNoArg>(
  policy: Policy<PolicyName, TPolicyCondition, PolicyErrorFactory>
): void;

function assert<TPolicyCondition extends PolicyConditionTypeGuard<any> | PolicyConditionWithArg<any>>(
  policy: Policy<PolicyName, TPolicyCondition, PolicyErrorFactory>,
  arg: TPolicyCondition extends PolicyConditionNoArg ? never : PolicyConditionArg<TPolicyCondition>
): asserts arg is TPolicyCondition extends PolicyConditionNoArg
  ? never
  : PolicyConditionTypeGuardResult<TPolicyCondition>;
```

Example:
```ts
const guard = Guard(context);

const post = await fetchPost(id);

assert(guard.post.policy("is author"), post);
// post.authorId === context.userId
```

### `check`
```typescript
function check(name: string, condition: PolicyConditionNoArg): boolean;

function check<TPolicyCondition extends PolicyConditionTypeGuard<any> | PolicyConditionWithArg<any>>(
  name: string,
  condition: TPolicyCondition,
  arg: TPolicyCondition extends PolicyConditionNoArg ? never : PolicyConditionArg<TPolicyCondition>
): arg is TPolicyCondition extends PolicyConditionNoArg ? never : PolicyConditionTypeGuardResult<TPolicyCondition>;

function check<TPolicyCondition extends PolicyConditionNoArg>(
  policy: Policy<PolicyName, TPolicyCondition>
): boolean;

function check<TPolicyCondition extends PolicyConditionTypeGuard<any> | PolicyConditionWithArg<any>>(
  policy: Policy<PolicyName, TPolicyCondition>,
  arg: TPolicyCondition extends PolicyConditionNoArg ? never : PolicyConditionArg<TPolicyCondition>
): arg is TPolicyCondition extends PolicyConditionNoArg ? never : PolicyConditionTypeGuardResult<TPolicyCondition>;
```

Example:
```ts
const guard = Guard(context);

const post = await fetchPost(id);

if (check(guard.post.policy("post has comments"), post)) {
  console.log("Post has comments");
}
```
### Condition helpers
#### `or`
Logical OR operator for policy conditions.

```typescript
function or(...conditions: (() => Policy<PolicyName, PolicyCondition, PolicyConditionArg<PolicyCondition>> | boolean)[])
```

Example:
```ts
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
```

#### `and`
Logical AND operator for policy conditions.


```typescript
function and(
  ...conditions: (() => Policy<PolicyName, PolicyCondition, PolicyConditionArg<PolicyCondition>> | boolean)[]
)
```

Example:
```ts
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
```