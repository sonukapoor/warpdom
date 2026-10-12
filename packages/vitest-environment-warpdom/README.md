# vitest-environment-warpdom

Lets Vitest find [warpdom](https://github.com/sonukapoor/warpdom) by name:

```sh
npm install --save-dev warpdom vitest-environment-warpdom
```

```js
// vitest.config.js
export default { test: { environment: 'warpdom' } };
```

Without this package, use the path warpdom exports:
`import { environment } from 'warpdom/vitest/environment'`.
