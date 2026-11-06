fn main() {
    #[cfg(feature = "desktop")]
    {
        // Rebuild the Windows executable's icon resource when artwork changes.
        println!("cargo:rerun-if-changed=icons");
        tauri_build::build()
    }
}
