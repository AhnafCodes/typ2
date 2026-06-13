fn main() {
    // Emits the platform link flags napi cdylibs need (e.g. `-undefined
    // dynamic_lookup` on macOS). Cdylib-only flags, so plain `cargo test`
    // builds are unaffected.
    napi_build::setup();
}
