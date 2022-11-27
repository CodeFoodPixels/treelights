const neopixel = require("neopixel");
const WiFi = require("Wifi");
const MQTT = require("tinyMQTT");

const config = {
  wifi: {
    ssid: "",
    key: "",
  },
  mqtt: {
    broker: "home.lukeb.co.uk",
    username: "public",
    password: "public",
    topics: {
      ping: "public/tree/ping",
      status: "public/tree/status",
    },
  },
  pixelPin: NodeMCU.D3,
  numPixels: 100,
  brightness: 20,
  timerValue: 100,
  onPause: 1000,
  offPause: 1000,
  rainbowBaseColors: [
    [255, 0, 0],
    [255, 255, 0],
    [0, 255, 0],
    [0, 255, 255],
    [0, 0, 255],
    [255, 0, 255],
  ],
};

const state = {
  ledStatus: "OFF",
  ledColor: [255, 255, 255],
  offPause: config.offPause,
  onPause: config.onPause,
  ledInterval: 0,
  ledTimeout: 0,
  pingInterval: 0,
  rainbow: [],
};

function generateRainbow() {
  const steps = Math.ceil(config.numPixels / config.rainbowBaseColors.length);

  state.rainbow = new Uint8ClampedArray(
    steps * config.rainbowBaseColors.length * 3
  );

  config.rainbowBaseColors.forEach((color, i) => {
    const nextColor =
      config.rainbowBaseColors[(i + 1) % config.rainbowBaseColors.length];
    const stepSize = {
      r: (nextColor[0] - color[0]) / steps,
      g: (nextColor[1] - color[1]) / steps,
      b: (nextColor[2] - color[2]) / steps,
    };
    for (let a = 0; a < steps; a++) {
      const baseIndex = (i * steps + a) * 3;
      state.rainbow[baseIndex] = color[0] + Math.round(stepSize.r * a);
      state.rainbow[baseIndex + 1] = color[1] + Math.round(stepSize.g * a);
      state.rainbow[baseIndex + 2] = color[2] + Math.round(stepSize.b * a);
    }
  });
}

function updateRainbow(reverse) {
  if (reverse) {
    const colors = state.rainbow.slice(-3);
    state.rainbow.set(state.rainbow.subarray(0, state.rainbow.length - 3), 3);
    state.rainbow.set(colors, state.rainbow.length - 3);
    return;
  }

  const colors = state.rainbow.slice(0, 3);
  state.rainbow.set(state.rainbow.subarray(3));
  state.rainbow.set(colors, state.rainbow.length - 3);
}

function throttle(func, limit) {
  let inThrottle;
  return function (ev) {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        func.apply(context, args);
      }, limit);
    }
  };
}

function hexToRGB(hex) {
  if (hex[0] === "#") {
    hex = hex.slice(1, hex.length);
  }

  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function writeAll(r, g, b, brightness) {
  if (brightness === undefined) {
    brightness = config.brightness;
  }
  const data = new Uint8ClampedArray(config.numPixels * 3);
  data[0] = adjustBrightness(g, brightness);
  data[1] = adjustBrightness(r, brightness);
  data[2] = adjustBrightness(b, brightness);
  for (let i = 3; i < config.numPixels * 3; i++) {
    data[i] = data[i % 3];
  }
  neopixel.write(config.pixelPin, data);
}

function writePixels(pixelColours, brightness) {
  if (brightness === undefined) {
    brightness = config.brightness;
  }

  neopixel.write(
    config.pixelPin,
    pixelColours.map((pixel) => adjustBrightness(pixel, brightness))
  );
}

function adjustBrightness(i, brightness) {
  return Math.round((i / 100) * brightness);
}

const ledPatterns = {
  on: () => {
    if (state.ledColor === "RAINBOW") {
      state.ledInterval = setInterval(() => {
        writeAll(state.rainbow[0], state.rainbow[1], state.rainbow[2]);
        updateRainbow();
        process.memory();
      }, config.timerValue);
    } else {
      writeAll(state.ledColor[0], state.ledColor[1], state.ledColor[2]);
    }
  },
  off: () => {
    writeAll(0, 0, 0);
  },
  cascade: () => {
    state.ledInterval = setInterval(() => {
      writePixels(state.rainbow);
      updateRainbow();
      process.memory();
    }, config.timerValue);
  },
  bounce: () => {
    let offset = 0;
    let reverse = false;

    state.ledInterval = setInterval(() => {
      writePixels(state.rainbow);

      if (offset === state.rainbow.length - 1) {
        reverse = true;
      } else if (offset === 0) {
        reverse = false;
      }

      offset = reverse ? offset - 3 : offset + 3;

      updateRainbow(reverse);
      process.memory();
    }, config.timerValue);
  },
  fadeOn: () => {
    let fadeIn = true;
    let fading = true;
    let brightnessModifier = 0;

    const fadeLED = () => {
      if (
        (brightnessModifier.toFixed(1) == "0.0" && fadeIn === false) ||
        (brightnessModifier.toFixed(1) === "1.0" && fadeIn === true)
      ) {
        fading = false;
        fadeIn = !fadeIn;

        ledTimeout = setTimeout(
          () => {
            fading = true;
          },
          fadeIn ? state.offPause : state.onPause
        );
      }

      if (fading) {
        brightnessModifier = fadeIn
          ? brightnessModifier + 0.1
          : brightnessModifier - 0.1;
      }

      if (state.ledColor === "RAINBOW") {
        writeAll(
          state.rainbow[0],
          state.rainbow[1],
          state.rainbow[2],
          config.brightness * brightnessModifier
        );
        updateRainbow();
        process.memory();
      } else {
        writeAll(
          state.ledColor[0],
          state.ledColor[1],
          state.ledColor[2],
          config.brightness * brightnessModifier
        );
      }
    };

    state.ledInterval = setInterval(fadeLED, config.timerValue);
  },
  flashOn: () => {
    let ledOn = false;

    const ledFlash = () => {
      if (ledOn) {
        if (state.ledColor === "RAINBOW") {
          writeAll(state.rainbow[0], state.rainbow[1], state.rainbow[2]);
        } else {
          writeAll(state.ledColor[0], state.ledColor[1], state.ledColor[2]);
        }
      } else {
        writeAll(0, 0, 0);
      }

      state.ledTimeout = setTimeout(
        ledFlash,
        ledOn ? state.onPause : state.offPause
      );

      ledOn = !ledOn;
    };

    if (state.ledColor === "RAINBOW") {
      state.ledInterval = setInterval(() => {
        updateRainbow();
        process.memory();
      }, config.timerValue);
    }

    state.ledTimeout = setTimeout(ledFlash, state.onPause);
  },
};

const updateLights = throttle(() => {
  if (state.ledInterval) {
    clearInterval(state.ledInterval);
    state.ledInterval = 0;
  }

  if (state.ledTimeout) {
    clearTimeout(state.ledTimeout);
    state.ledTimeout = 0;
  }

  if (state.ledStatus === "ON") {
    ledPatterns.on();
  } else if (state.ledStatus === "OFF") {
    ledPatterns.off();
  } else if (state.ledStatus === "CASCADE") {
    ledPatterns.cascade();
  } else if (state.ledStatus === "BOUNCE") {
    ledPatterns.bounce();
  } else if (state.ledStatus === "FADE_ON") {
    ledPatterns.fadeOn();
  } else if (state.ledStatus === "FLASH_ON") {
    ledPatterns.flashOn();
  }
}, 1000);

writeAll(0, 0, 0);
generateRainbow();
process.memory();

const mqtt = MQTT.create(config.mqtt.broker, {
  username: config.mqtt.username,
  password: config.mqtt.password,
});

mqtt.on("connected", function () {
  console.log("Connected to MQTT");

  mqtt.subscribe(config.mqtt.topics.status);

  state.ledStatus = "CASCADE";
  state.ledColor = "RAINBOW";

  updateLights();

  state.pingInterval = setInterval(() => {
    mqtt.publish(config.mqtt.topics.ping, "ping");
  }, 5000);
});

mqtt.on("message", function (pub) {
  if (pub.topic === config.mqtt.topics.status) {
    const message = pub.message.split(",");
    console.log(message);
    if (
      ["ON", "OFF", "CASCADE", "BOUNCE", "FADE_ON", "FLASH_ON"].indexOf(
        message[0]
      ) === -1
    ) {
      return;
    }
    state.ledStatus = message[0];
    state.ledColor =
      message[1] === "RAINBOW" ? "RAINBOW" : hexToRGB(message[1]);
    state.onPause = Math.min(
      Math.max(parseInt(message[2], 10) || config.onPause, 200),
      2000
    );
    state.offPause = Math.min(
      Math.max(parseInt(message[3], 10) || config.offPause, 200),
      2000
    );

    updateLights();
  }
});

mqtt.on("disconnected", function () {
  console.log("MQTT disconnected");
  clearInterval(state.pingInterval);
  setTimeout(function () {
    console.log("Cycling Wifi");
    WiFi.disconnect();
  }, 2500);
});

function connectWifi() {
  WiFi.connect(config.wifi.ssid, {
    password: config.wifi.key,
  });
}
connectWifi();

WiFi.on("connected", () => {
  console.log("Connected to wifi");
  mqtt.connect();
});

WiFi.on("disconnected", () => {
  console.log("Wifi disconnected");
  setTimeout(function () {
    console.log("Reconnecting Wifi");
    connectWifi();
  }, 2500);
});

WiFi.stopAP();
