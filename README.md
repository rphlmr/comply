# Comply

![GitHub Repo stars](https://img.shields.io/github/stars/rphlmr/comply?style=social)
![npm](https://img.shields.io/npm/v/open-source-stack?style=plastic)
![GitHub](https://img.shields.io/github/license/rphlmr/comply?style=plastic)
![npm](https://img.shields.io/npm/dy/open-source-stack?style=plastic)
![npm](https://img.shields.io/npm/dw/open-source-stack?style=plastic)
![GitHub top language](https://img.shields.io/github/languages/top/rphlmr/comply?style=plastic)

# Features
TODO with better examples

## Define a policy
```ts
import { definePolicy } from "comply";

const policy = definePolicy(
  "has items",
  (arr: unknown[]) => arr.length > 0,
  () => new Error("Array is empty")
);
```

## Check a policy
```ts
import { check } from "comply";

check(policy, []); // false
check(policy, [1]); // true
```

## Assert a policy
```ts
import { assert } from "comply";

assert(policy, []); // throws an error
assert(policy, [1]); // does not throw an error
```

## Define policies
```ts
import { definePolicies } from "comply";

const arrayPolicies = definePolicies(() => {
  return [
    definePolicy(
      "has items",
      (arr: unknown[]) => arr.length > 0,
      () => new Error("Array is empty")
    ),
  ];
});

function Guard(){
	return {
		array: arrayPolicies()
	}
}

check(array.policy("has items"), []); // false
check(array.policy("has items"), [1]); // true

assert(array.policy("has items"), []); // throws an error
assert(array.policy("has items"), [1]); // does not throw an error
```

## Scripts

- `npm run build` - Build the package.
- `npm run test` - Run the tests.
- `npm run lint` - Lint the code.
- `npm run dev` - Start the package and ESM test app in watch mode for development.
- `npm run dev:cjs` - Start the package and CJS test app in watch mode for development.
