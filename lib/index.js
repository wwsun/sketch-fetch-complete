/* globals NSJSONSerialization NSJSONWritingPrettyPrinted NSDictionary NSHTTPURLResponse NSString NSASCIIStringEncoding NSUTF8StringEncoding coscript NSURL NSMutableURLRequest NSMutableData NSURLConnection */
// https://github.com/zhzxang/sketch-fetch-complete

const _ObjCClass = require('cocoascript-class');

const ObjCClass = _ObjCClass.default;

function toUTF8(data) {
  const str = NSString.alloc().initWithString(data);
  return str.dataUsingEncoding(NSUTF8StringEncoding);
}

function response(httpResponse, data) {
  const keys = [];
  const all = [];
  const headers = {};
  let header;

  for (let i = 0; i < httpResponse.allHeaderFields().allKeys().length; i++) {
    const key = httpResponse.allHeaderFields().allKeys()[i].toLowerCase();
    const value = String(httpResponse.allHeaderFields()[key]);
    keys.push(key);
    all.push([key, value]);
    header = headers[key];
    headers[key] = header ? (header + ',' + value) : value;
  }

  return {
    ok: (httpResponse.statusCode() / 200 | 0) == 1, // 200-399
    status: httpResponse.statusCode(),
    statusText: NSHTTPURLResponse.localizedStringForStatusCode(httpResponse.statusCode()),
    url: String(httpResponse.URL().absoluteString()),
    clone: response.bind(this, httpResponse, data),
    text() {
      return new Promise(((resolve, reject) => {
        const str = NSString.alloc().initWithData_encoding(data, NSASCIIStringEncoding);
        if (str) {
          resolve(str);
        } else {
          reject(new Error("Couldn't parse body"));
        }
      }));
    },
    json() {
      return new Promise(((resolve, reject) => {
        const str = NSString.alloc().initWithData_encoding(data, NSUTF8StringEncoding);
        if (str) {
          // parse errors are turned into exceptions, which cause promise to be rejected
          const obj = JSON.parse(str);
          resolve(obj);
        } else {
          reject(new Error('Could not parse JSON because it is not valid UTF-8 data.'));
        }
      }));
    },
    blob() {
      return Promise.resolve(data);
    },
    headers: {
      keys() { return keys; },
      entries() { return all; },
      get(n) { return headers[n.toLowerCase()]; },
      has(n) { return n.toLowerCase() in headers; },
    },
  };
}

// We create one ObjC class for ourselves here
let DelegateClass;

function fetch(urlString, options) {
  options = options || {};
  let fiber;
  try {
    fiber = coscript.createFiber();
  } catch (err) {
    coscript.shouldKeepAround = true;
  }
  return new Promise(((resolve, reject) => {
    const url = NSURL.alloc().initWithString(urlString);
    const request = NSMutableURLRequest.requestWithURL(url);
    request.setHTTPMethod(options.method || 'GET');

    let boundary = '';
    if (options.formdata) {
      boundary = '--WebKitFormBoundaryDAolWtOraDBpelWB';
      request.setValue_forHTTPHeaderField(`multipart/form-data; boundary=${boundary}`, 'Content-Type');
    } else {
      Object.keys(options.headers || {}).forEach((i) => {
        request.setValue_forHTTPHeaderField(options.headers[i], i);
      });
    }

    if (options.formdata) {
      /*
        {name: [value, filename]}
      */
      const data = NSData.dataWithContentsOfFile(options.formdata);
      const formParameters = options.formParameters || {};

      const filename = formParameters.filename || options.formdata.split('/').pop();
      const newLine = '\r\n';

      const body = NSMutableData.data();

      if (formParameters) {
        delete formParameters.filename;
        for (const key in formParameters) {
          body.appendData(toUTF8(`--${boundary}`));
          body.appendData(toUTF8(newLine));
          body.appendData(toUTF8(`Content-Disposition: form-data; name="${key}"`));
          body.appendData(toUTF8(newLine));
          body.appendData(toUTF8(newLine));
          body.appendData(toUTF8(`${formParameters[key]}`));
          body.appendData(toUTF8(newLine));
        }
      }

      body.appendData(toUTF8(`--${boundary}`));

      body.appendData(toUTF8(newLine));
      body.appendData(toUTF8(`Content-Disposition: form-data;name="file";filename="${filename}"`));

      body.appendData(toUTF8(newLine));
      body.appendData(toUTF8('Content-Type: application/octet-stream'));// TODO: change Content-Type based on file type

      body.appendData(toUTF8(newLine));
      body.appendData(toUTF8(newLine));
      body.appendData(data);
      body.appendData(toUTF8(newLine));

      body.appendData(toUTF8(`--${boundary}--`));
      body.appendData(toUTF8(newLine));

      request.setValue_forHTTPHeaderField('' + body.length(), 'Content-Length');
      request.setHTTPBody(body);
    } else if (options.body) {
      let data;
      if (typeof options.body === 'string') {
        const str = NSString.alloc().initWithString(options.body);
        data = str.dataUsingEncoding(NSUTF8StringEncoding);
      } else {
        let error;
        data = NSJSONSerialization.dataWithJSONObject_options_error(options.body, NSJSONWritingPrettyPrinted, error);
        if (error != null) {
          return reject(error);
        }
        request.setValue_forHTTPHeaderField('' + data.length(), 'Content-Length');
      }
      request.setHTTPBody(data);
    }

    let finished = false;

    if (!DelegateClass) {
      DelegateClass = ObjCClass({
        classname: 'FetchPolyfillDelegate',
        data: null,
        httpResponse: null,
        fiber: null,
        callbacks: null,

        'connectionDidFinishLoading:': function (connection) {
          finished = true;
          this.callbacks.resolve(response(this.httpResponse, this.data));
          if (this.fiber) {
            this.fiber.cleanup();
          } else {
            coscript.shouldKeepAround = false;
          }
        },
        'connection:didReceiveResponse:': function (connection, httpResponse) {
          this.httpResponse = httpResponse;
          this.data = NSMutableData.alloc().init();
        },
        'connection:didFailWithError:': function (connection, error) {
          finished = true;
          this.callbacks.reject(error);
          if (this.fiber) {
            this.fiber.cleanup();
          } else {
            coscript.shouldKeepAround = false;
          }
        },
        'connection:didReceiveData:': function (connection, data) {
          this.data.appendData(data);
        },
      });
    }

    const connectionDelegate = DelegateClass.new();
    connectionDelegate.callbacks = NSDictionary.dictionaryWithDictionary({
      resolve,
      reject,
    });
    connectionDelegate.fiber = fiber;

    const connection = NSURLConnection.alloc().initWithRequest_delegate(
      request,
      connectionDelegate,
    );

    if (fiber) {
      fiber.onCleanup(() => {
        if (!finished) {
          connection.cancel();
        }
      });
    }
  }));
}

module.exports = fetch;
