class Box {
// T: {T}

    value;  // T: T

    constructor(value) {
        this.value = value;
    }

    map(fn) {
        // T: {U}((T) => U) => Box{U}
        return new Box(fn(this.value));
    }
}

const boxed = new Box(42); // T: Box{number}
const doubled = boxed.map(n => n * 2);

export { Box, boxed, doubled };
