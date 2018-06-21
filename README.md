# @nupt/sketch-fetch

A [fetch](https://developer.mozilla.org/en/docs/Web/API/Fetch_API) polyfill for sketch inspired by [unfetch](https://github.com/developit/unfetch). It is automatically included (when needed) when using [skpm](https://github.com/skpm/skpm).

## Installation

```bash
npm i -S @nupt/sketch-fetch
```

## Usage

```js
const fetch = require('@nupt/sketch-fetch')

fetch("https://google.com")
  .then(response => response.text())
  .then(text => console.log(text))
  .catch(e => console.error(e))
```

## extra add

upload file

```js
const fetch = require('sketch-fetch-complete')

fetch("https://google.com",{
  method: 'post',
  // filepath of local file
  formdata: path,
  // form parameters
  formParameters: {
    name: 'sample',
    author: 'wwsun',
  }
})
  .then(response => response.text())
  .then(text => console.log(text))
  .catch(e => console.error(e))
```

