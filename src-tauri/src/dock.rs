/// Set the dock icon badge label (unread notification count)
#[cfg(target_os = "macos")]
pub fn set_dock_badge(count: u32) {
    use cocoa::appkit::NSApp;
    use cocoa::base::nil;
    use cocoa::foundation::NSString;
    use objc::*;

    unsafe {
        let app = NSApp();
        let dock_tile: *mut objc::runtime::Object = msg_send![app, dockTile];

        let label = if count == 0 {
            NSString::alloc(nil).init_str("")
        } else if count > 99 {
            NSString::alloc(nil).init_str("99+")
        } else {
            NSString::alloc(nil).init_str(&count.to_string())
        };

        let _: () = msg_send![dock_tile, setBadgeLabel: label];
    }
}

#[cfg(not(target_os = "macos"))]
pub fn set_dock_badge(_count: u32) {}
