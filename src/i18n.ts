// Localized default names for the HomeKit services this plugin creates.
// HomeKit itself never translates service names, so units in non-English
// homes would show e.g. "Outdoor Temperature" between otherwise localized
// tiles. The language comes from the `language` config field; the settings
// UI offers the same languages as the Homebridge UI and defaults to the
// language selected there. These are only *default* names — a rename done
// in the Home app always wins (see ClimateAccessory.applyDefaultServiceName).

export interface ServiceNames {
  // Fallback accessory name when the unit reports no name of its own.
  airConditioner: string;
  // TemperatureSensor service fed by the outdoor unit's sensor.
  outdoorTemperature: string;
  // Per-axis swing switches (climateSwingSwitches option).
  verticalSwing: string;
  horizontalSwing: string;
  // Matter accessories named "<unit> <role>" (in HomeKit these are services
  // of the unit's own accessory): the all-axes swing switch (HAP has the
  // SwingMode characteristic instead), the fan and the humidity sensor.
  swing: string;
  fan: string;
  humidity: string;
}

export type ServiceNameKey = keyof ServiceNames;

// One entry per Homebridge UI language (homebridge-config-ui-x 5.x).
const SERVICE_NAMES: Record<string, ServiceNames> = {
  'bg': {
    airConditioner: 'Климатик',
    outdoorTemperature: 'Външна температура',
    verticalSwing: 'Вертикално люлеене',
    horizontalSwing: 'Хоризонтално люлеене',
    swing: 'Люлеене',
    fan: 'Вентилатор',
    humidity: 'Влажност',
  },
  'ca': {
    airConditioner: 'Aire condicionat',
    outdoorTemperature: 'Temperatura exterior',
    verticalSwing: 'Oscil·lació vertical',
    horizontalSwing: 'Oscil·lació horitzontal',
    swing: 'Oscil·lació',
    fan: 'Ventilador',
    humidity: 'Humitat',
  },
  'zh-CN': {
    airConditioner: '空调',
    outdoorTemperature: '室外温度',
    verticalSwing: '垂直摆动',
    horizontalSwing: '水平摆动',
    swing: '摆动',
    fan: '风扇',
    humidity: '湿度',
  },
  'zh-TW': {
    airConditioner: '空調',
    outdoorTemperature: '室外溫度',
    verticalSwing: '垂直擺動',
    horizontalSwing: '水平擺動',
    swing: '擺動',
    fan: '風扇',
    humidity: '濕度',
  },
  'cs': {
    airConditioner: 'Klimatizace',
    outdoorTemperature: 'Venkovní teplota',
    verticalSwing: 'Vertikální natáčení',
    horizontalSwing: 'Horizontální natáčení',
    swing: 'Natáčení',
    fan: 'Ventilátor',
    humidity: 'Vlhkost',
  },
  'nl': {
    airConditioner: 'Airco',
    outdoorTemperature: 'Buitentemperatuur',
    verticalSwing: 'Verticale zwenking',
    horizontalSwing: 'Horizontale zwenking',
    swing: 'Zwenking',
    fan: 'Ventilator',
    humidity: 'Luchtvochtigheid',
  },
  'en': {
    airConditioner: 'Air Conditioner',
    outdoorTemperature: 'Outdoor Temperature',
    verticalSwing: 'Vertical Swing',
    horizontalSwing: 'Horizontal Swing',
    swing: 'Swing',
    fan: 'Fan',
    humidity: 'Humidity',
  },
  'fi': {
    airConditioner: 'Ilmastointilaite',
    outdoorTemperature: 'Ulkolämpötila',
    verticalSwing: 'Pystysuuntainen kääntö',
    horizontalSwing: 'Vaakasuuntainen kääntö',
    swing: 'Kääntö',
    fan: 'Tuuletin',
    humidity: 'Kosteus',
  },
  'fr': {
    airConditioner: 'Climatiseur',
    outdoorTemperature: 'Température extérieure',
    verticalSwing: 'Oscillation verticale',
    horizontalSwing: 'Oscillation horizontale',
    swing: 'Oscillation',
    fan: 'Ventilateur',
    humidity: 'Humidité',
  },
  'de': {
    airConditioner: 'Klimaanlage',
    outdoorTemperature: 'Außentemperatur',
    verticalSwing: 'Vertikales Schwenken',
    horizontalSwing: 'Horizontales Schwenken',
    swing: 'Schwenken',
    fan: 'Ventilator',
    humidity: 'Luftfeuchtigkeit',
  },
  'he': {
    airConditioner: 'מזגן',
    outdoorTemperature: 'טמפרטורה חיצונית',
    verticalSwing: 'תנודה אנכית',
    horizontalSwing: 'תנודה אופקית',
    swing: 'תנודה',
    fan: 'מאוורר',
    humidity: 'לחות',
  },
  'hu': {
    airConditioner: 'Légkondicionáló',
    outdoorTemperature: 'Kültéri hőmérséklet',
    verticalSwing: 'Függőleges legyezés',
    horizontalSwing: 'Vízszintes legyezés',
    swing: 'Legyezés',
    fan: 'Ventilátor',
    humidity: 'Páratartalom',
  },
  'id': {
    airConditioner: 'AC',
    outdoorTemperature: 'Suhu luar ruangan',
    verticalSwing: 'Ayunan vertikal',
    horizontalSwing: 'Ayunan horizontal',
    swing: 'Ayunan',
    fan: 'Kipas',
    humidity: 'Kelembapan',
  },
  'it': {
    airConditioner: 'Condizionatore',
    outdoorTemperature: 'Temperatura esterna',
    verticalSwing: 'Oscillazione verticale',
    horizontalSwing: 'Oscillazione orizzontale',
    swing: 'Oscillazione',
    fan: 'Ventilatore',
    humidity: 'Umidità',
  },
  'ja': {
    airConditioner: 'エアコン',
    outdoorTemperature: '外気温',
    verticalSwing: '上下スイング',
    horizontalSwing: '左右スイング',
    swing: 'スイング',
    fan: 'ファン',
    humidity: '湿度',
  },
  'ko': {
    airConditioner: '에어컨',
    outdoorTemperature: '실외 온도',
    verticalSwing: '상하 스윙',
    horizontalSwing: '좌우 스윙',
    swing: '스윙',
    fan: '팬',
    humidity: '습도',
  },
  'mk': {
    airConditioner: 'Клима уред',
    outdoorTemperature: 'Надворешна температура',
    verticalSwing: 'Вертикално нишање',
    horizontalSwing: 'Хоризонтално нишање',
    swing: 'Нишање',
    fan: 'Вентилатор',
    humidity: 'Влажност',
  },
  'no': {
    airConditioner: 'Klimaanlegg',
    outdoorTemperature: 'Utetemperatur',
    verticalSwing: 'Vertikal svinging',
    horizontalSwing: 'Horisontal svinging',
    swing: 'Svinging',
    fan: 'Vifte',
    humidity: 'Luftfuktighet',
  },
  'pl': {
    airConditioner: 'Klimatyzator',
    outdoorTemperature: 'Temperatura zewnętrzna',
    verticalSwing: 'Wachlowanie pionowe',
    horizontalSwing: 'Wachlowanie poziome',
    swing: 'Wachlowanie',
    fan: 'Wentylator',
    humidity: 'Wilgotność',
  },
  'pt-BR': {
    airConditioner: 'Ar-condicionado',
    outdoorTemperature: 'Temperatura externa',
    verticalSwing: 'Oscilação vertical',
    horizontalSwing: 'Oscilação horizontal',
    swing: 'Oscilação',
    fan: 'Ventilador',
    humidity: 'Umidade',
  },
  'pt': {
    airConditioner: 'Ar condicionado',
    outdoorTemperature: 'Temperatura exterior',
    verticalSwing: 'Oscilação vertical',
    horizontalSwing: 'Oscilação horizontal',
    swing: 'Oscilação',
    fan: 'Ventilador',
    humidity: 'Humidade',
  },
  'ru': {
    airConditioner: 'Кондиционер',
    outdoorTemperature: 'Наружная температура',
    verticalSwing: 'Вертикальное качание',
    horizontalSwing: 'Горизонтальное качание',
    swing: 'Качание',
    fan: 'Вентилятор',
    humidity: 'Влажность',
  },
  'sl': {
    airConditioner: 'Klimatska naprava',
    outdoorTemperature: 'Zunanja temperatura',
    verticalSwing: 'Navpično nihanje',
    horizontalSwing: 'Vodoravno nihanje',
    swing: 'Nihanje',
    fan: 'Ventilator',
    humidity: 'Vlažnost',
  },
  'es': {
    airConditioner: 'Aire acondicionado',
    outdoorTemperature: 'Temperatura exterior',
    verticalSwing: 'Oscilación vertical',
    horizontalSwing: 'Oscilación horizontal',
    swing: 'Oscilación',
    fan: 'Ventilador',
    humidity: 'Humedad',
  },
  'sv': {
    airConditioner: 'Luftkonditionering',
    outdoorTemperature: 'Utomhustemperatur',
    verticalSwing: 'Vertikal svängning',
    horizontalSwing: 'Horisontell svängning',
    swing: 'Svängning',
    fan: 'Fläkt',
    humidity: 'Luftfuktighet',
  },
  'th': {
    airConditioner: 'เครื่องปรับอากาศ',
    outdoorTemperature: 'อุณหภูมิภายนอก',
    verticalSwing: 'สวิงแนวตั้ง',
    horizontalSwing: 'สวิงแนวนอน',
    swing: 'สวิง',
    fan: 'พัดลม',
    humidity: 'ความชื้น',
  },
  'tr': {
    airConditioner: 'Klima',
    outdoorTemperature: 'Dış ortam sıcaklığı',
    verticalSwing: 'Dikey salınım',
    horizontalSwing: 'Yatay salınım',
    swing: 'Salınım',
    fan: 'Fan',
    humidity: 'Nem',
  },
  'uk': {
    airConditioner: 'Кондиціонер',
    outdoorTemperature: 'Зовнішня температура',
    verticalSwing: 'Вертикальне гойдання',
    horizontalSwing: 'Горизонтальне гойдання',
    swing: 'Гойдання',
    fan: 'Вентилятор',
    humidity: 'Вологість',
  },
};

const DEFAULT_LANGUAGE = 'en';

// Resolve a config language to a table entry: exact match first, then the
// base language ("de-AT" -> "de"), then English. Case-insensitive, so a
// hand-edited "zh-tw" still works.
export function getServiceNames(language?: string): ServiceNames {
  const wanted = (language ?? '').trim().toLowerCase();
  if (wanted !== '') {
    for (const code of Object.keys(SERVICE_NAMES)) {
      if (code.toLowerCase() === wanted) {
        return SERVICE_NAMES[code];
      }
    }
    const base = wanted.split('-')[0];
    for (const code of Object.keys(SERVICE_NAMES)) {
      if (code.toLowerCase() === base) {
        return SERVICE_NAMES[code];
      }
    }
  }
  return SERVICE_NAMES[DEFAULT_LANGUAGE];
}

// True when the value is this plugin's default name for the key in *any*
// language — i.e. the user never renamed the service, so a language change
// may safely rename it.
export function isDefaultServiceName(key: ServiceNameKey, value: string): boolean {
  const trimmed = value.trim();
  return Object.values(SERVICE_NAMES).some((names) => names[key] === trimmed);
}
