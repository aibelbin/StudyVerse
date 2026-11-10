import { SCENES } from '../../../shared/scenes';
import { SceneBook } from '../../../shared/scenes/book';

/** The client's one scene book: fixed scenes plus the village and cabins from the latest roster. */
export const book = new SceneBook(SCENES);
