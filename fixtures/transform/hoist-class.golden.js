import { User } from './types';
// T: import { User } from './types'
/** @type {number} */
let count = 0; // T: number

/** @template T */
class Box {
// T: {T}
/** @type {T} */
    value; // T: T
}
