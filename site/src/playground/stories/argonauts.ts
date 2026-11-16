import { routeKilometres, type MapStory, type StoryStop } from './MapStoryStage';
import { GREEK_WORLD } from './boundaries';

/**
 * The voyage of the Argo, as Apollonius of Rhodes tells it: out from Iolcos to Colchis for the Golden
 * Fleece, and home the long way, by the Ister into the Adriatic, up the Eridanus and down the
 * Rhodanus, past Circe, the Sirens and the Wandering Rocks, and through the Libyan desert.
 *
 * Places follow the usual identifications (the Eridanus as the Po, the Rhodanus as the Rhône, Lake
 * Tritonis by Euesperides); the poet's rivers join where real ones do not.
 */

const LEGS = ['Setting out', 'To Colchis', 'The flight', 'Rivers to Circe', 'Libya and home'] as const;
type Leg = typeof LEGS[number];

const stop = (id: string, place: string, leg: Leg, order: number, longitude: number, latitude: number): StoryStop =>
  ({ id, place, leg, order, longitude, latitude });

const STOPS: readonly StoryStop[] = [
  stop('iolcos', 'Iolcos', 'Setting out', 1, 22.95, 39.36),
  stop('lemnos', 'Lemnos', 'Setting out', 2, 25.06, 39.87),
  stop('cyzicus', 'Cyzicus', 'Setting out', 3, 27.88, 40.39),
  stop('mysia', 'Mysia', 'To Colchis', 4, 29.15, 40.43),
  stop('phineus', 'Salmydessus', 'To Colchis', 5, 28.09, 41.63),
  stop('rocks', 'The Clashing Rocks', 'To Colchis', 6, 29.12, 41.23),
  stop('mariandyni', 'The Mariandyni', 'To Colchis', 7, 31.42, 41.28),
  stop('ares', 'The Isle of Ares', 'To Colchis', 8, 38.43, 40.93),
  stop('colchis', 'Colchis', 'The flight', 9, 41.67, 42.15),
  stop('ister', 'Mouth of the Ister', 'The flight', 10, 29.65, 45.15),
  stop('brygean', 'The Brygean Isles', 'The flight', 11, 14.4, 44.8),
  stop('eridanus', 'The Eridanus', 'Rivers to Circe', 12, 12.4, 44.95),
  stop('rhodanus', 'The Rhodanus', 'Rivers to Circe', 13, 4.7, 43.45),
  stop('aeaea', 'Aeaea', 'Rivers to Circe', 14, 13.05, 41.23),
  stop('sirens', 'The Sirens', 'Rivers to Circe', 15, 14.43, 40.58),
  stop('planctae', 'The Wandering Rocks', 'Rivers to Circe', 16, 15.63, 38.25),
  stop('drepane', 'Drepane', 'Libya and home', 17, 19.92, 39.62),
  stop('syrtis', 'The Syrtis', 'Libya and home', 18, 18.0, 31.0),
  stop('tritonis', 'Lake Tritonis', 'Libya and home', 19, 20.2, 31.9),
  stop('crete', 'Crete', 'Libya and home', 20, 25.13, 35.34),
  stop('aegina', 'Aegina', 'Libya and home', 21, 23.43, 37.75),
  stop('home', 'Iolcos', 'Libya and home', 22, 22.95, 39.36),
];

const roundTo = (value: number, step: number) => Math.round(value / step) * step;
const colchisAt = STOPS.findIndex((each) => each.id === 'colchis');
const OUT_KM = roundTo(routeKilometres(STOPS.slice(0, colchisAt + 1)), 100);
const BACK_KM = roundTo(routeKilometres(STOPS.slice(colchisAt)), 100);

export const ARGONAUTS: MapStory = {
  id: 'argonauts',
  title: 'The voyage of the Argo',
  stops: STOPS,
  legField: 'Leg',
  // Out in the sea's blues and greens, home through the warm colours of the rivers and the desert.
  legInks: ['#1d3557', '#2a9d8f', '#b2182b', '#e0622b', '#d9a320'],
  seas: [
    { text: 'Aegean Sea', longitude: 25.0, latitude: 38.4 },
    { text: 'Black Sea', longitude: 34.5, latitude: 43.4 },
    { text: 'Adriatic Sea', longitude: 15.8, latitude: 42.9 },
    { text: 'Tyrrhenian Sea', longitude: 11.6, latitude: 39.6 },
    { text: 'Ionian Sea', longitude: 18.4, latitude: 37.0 },
    { text: 'Mediterranean Sea', longitude: 15.0, latitude: 34.2 },
  ],
  canvas: { width: 760, height: 520 },
  boundaries: GREEK_WORLD,
  chapters: [
    {
      title: 'The Golden Fleece',
      text: 'King Pelias, who took the throne of Iolcos, sends his nephew Jason for the Golden Fleece, which hangs in a grove in Colchis, '
        + 'at the far end of the Black Sea. Jason gathers some fifty heroes on the Argo, the first great ship: Heracles, Orpheus, Castor and Polydeuces among them. '
        + `The way there is about ${OUT_KM.toLocaleString('en')} km; the way home, as Apollonius of Rhodes tells it, wanders some ${BACK_KM.toLocaleString('en')} km through rivers and desert.`,
      notes: [{ at: 'iolcos', text: 'Iolcos: the Argo sails' }, { at: 'colchis', text: 'Colchis: the Golden Fleece' }],
    },
    {
      title: 'Lemnos to Mysia',
      legs: ['Setting out'],
      frame: ['iolcos', 'lemnos', 'cyzicus', 'mysia'],
      text: 'On Lemnos the women have killed their men; they welcome the Argonauts, and their queen Hypsipyle takes Jason as her lover. '
        + 'At Cyzicus the Doliones receive them as friends, but a storm drives the Argo back by night and the two sides fight, each unknowing, and King Cyzicus is killed. '
        + 'In Mysia the nymphs of a spring draw young Hylas down into the water; Heracles, searching for him, is left behind.',
      notes: [
        { at: 'lemnos', text: 'The women of Lemnos' },
        { at: 'cyzicus', text: 'Friends killed in a night battle' },
        { at: 'mysia', text: 'Hylas lost; Heracles left behind' },
      ],
    },
    {
      title: 'Through the Clashing Rocks',
      legs: ['To Colchis'],
      frame: ['mysia', 'phineus', 'rocks', 'mariandyni', 'ares', 'colchis'],
      text: 'Polydeuces kills King Amycus of the Bebryces in a boxing match. The blind seer Phineus, freed from the Harpies by the sons of the North Wind, '
        + 'tells them how to pass the Clashing Rocks: send a dove through first. The rocks clip its tail, and the Argo’s stern. '
        + 'Along the Black Sea’s southern shore the seer Idmon and the helmsman Tiphys die; on the Isle of Ares, birds shoot bronze feathers at them.',
      notes: [
        { at: 'phineus', text: 'Phineus freed from the Harpies' },
        { at: 'rocks', text: 'A dove first, then the Argo' },
        { at: 'mariandyni', text: 'Idmon and Tiphys die' },
        { at: 'ares', text: 'Birds with bronze feathers' },
      ],
    },
    {
      title: 'The fleece and the flight',
      legs: ['The flight'],
      frame: ['colchis', 'ister', 'brygean'],
      text: 'King Aeetes sets Jason his tasks: yoke fire-breathing bulls, sow a field with dragon’s teeth, and fight the warriors who spring from it. '
        + 'Aeetes’ daughter Medea, in love with Jason, gives him a charm, and lulls the serpent that guards the fleece. They flee by the Ister, a river the poem runs '
        + 'into the Adriatic; Medea’s brother Absyrtus cuts them off there, and Jason kills him by treachery.',
      notes: [
        { at: 'colchis', text: 'Bulls of fire, dragon’s teeth' },
        { at: 'ister', on: 'leg', text: 'Up the Ister to the Adriatic' },
        { at: 'brygean', text: 'Absyrtus killed' },
      ],
    },
    {
      title: 'Rivers to Circe',
      legs: ['Rivers to Circe'],
      frame: ['eridanus', 'rhodanus', 'aeaea', 'sirens', 'planctae', 'drepane'],
      text: 'Zeus is angered by the murder, and the Argo itself speaks: they must go to Circe. They sail up the Eridanus, where Phaethon fell burning, '
        + 'and down the Rhodanus to the sea. Circe, Medea’s aunt, cleanses them of the killing. Orpheus’ lyre drowns the Sirens’ song, '
        + 'and Thetis and her Nereids steer the Argo past the Wandering Rocks. On Drepane, Jason marries Medea.',
      notes: [
        { at: 'eridanus', text: 'Where Phaethon fell' },
        { at: 'aeaea', text: 'Circe cleanses the murder' },
        { at: 'sirens', text: 'Orpheus outsings the Sirens' },
        { at: 'drepane', text: 'Jason weds Medea' },
      ],
    },
    {
      title: 'Libya and home',
      legs: ['Libya and home'],
      frame: ['drepane', 'syrtis', 'tritonis', 'crete', 'aegina', 'home'],
      text: 'A north wind drives them onto the shoals of the Syrtis. They carry the Argo on their shoulders for twelve days to Lake Tritonis, '
        + 'where the god Triton shows them the way to the sea. At Crete, Medea fells Talos, the bronze giant who guards the island. '
        + 'They come home to Iolcos with the fleece.',
      notes: [
        { at: 'syrtis', on: 'leg', text: 'Twelve days carrying the Argo' },
        { at: 'crete', text: 'Medea fells Talos' },
        { at: 'home', text: 'Home with the fleece' },
      ],
    },
    {
      title: 'The whole voyage',
      text: `Out by the straight way to the Black Sea, about ${OUT_KM.toLocaleString('en')} km; home by a poet’s rivers, the far west and the Libyan desert, `
        + `some ${BACK_KM.toLocaleString('en')} km more. Jason brings the fleece to Iolcos, but Pelias keeps the throne until Medea tricks his daughters into killing him, `
        + 'and the couple are driven out to Corinth.',
      notes: [
        { at: 'colchis', text: 'The fleece won' },
        { at: 'rhodanus', text: 'The far west' },
        { at: 'syrtis', text: 'Across the desert' },
        { at: 'home', text: 'Home to Iolcos' },
      ],
    },
  ],
};
