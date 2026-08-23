fn main() {
    tauri_build::build();

    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-search=native=native");
        println!("cargo:rustc-link-lib=dylib=FloatspaceSpotlightBridge");
        println!("cargo:rustc-link-arg=-Wl,-rpath,@loader_path/../Frameworks");
        println!("cargo:rerun-if-changed=native/libFloatspaceSpotlightBridge.dylib");
        
        cc::Build::new()
            .file("native/mac_auth.m")
            .flag("-fobjc-arc")
            .compile("mac_auth");
        
        println!("cargo:rustc-link-lib=framework=LocalAuthentication");
        println!("cargo:rustc-link-lib=framework=Foundation");
    }
}
