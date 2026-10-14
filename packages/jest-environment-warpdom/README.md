# jest-environment-warpdom

Lets Jest find [warpdom](https://github.com/sonukapoor/warpdom) by name:

```sh
npm install --save-dev warpdom jest-environment-warpdom
```

```js
// jest.config.js
module.exports = { testEnvironment: 'warpdom' };
```

Test files can then switch with a docblock, as with jsdom:
`/** @jest-environment warpdom */`.

Without this package, use the path warpdom exports:
`testEnvironment: 'warpdom/jest'`.
