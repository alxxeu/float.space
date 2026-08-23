#import <Foundation/Foundation.h>
#import <LocalAuthentication/LocalAuthentication.h>
#include <stdbool.h>

bool authenticate_user(const char* reason_str) {
    NSLog(@"[TouchID] Requesting authentication...");
    LAContext *context = [[LAContext alloc] init];
    NSError *error = nil;
    
    if ([context canEvaluatePolicy:LAPolicyDeviceOwnerAuthentication error:&error]) {
        dispatch_semaphore_t sema = dispatch_semaphore_create(0);
        __block bool success = false;
        
        NSString *reason = [NSString stringWithUTF8String:reason_str];
        [context evaluatePolicy:LAPolicyDeviceOwnerAuthentication
                localizedReason:reason
                          reply:^(BOOL s, NSError *e) {
            success = s;
            if (e) {
                NSLog(@"[TouchID] Error: %@", [e localizedDescription]);
            } else {
                NSLog(@"[TouchID] Success!");
            }
            dispatch_semaphore_signal(sema);
        }];
        
        dispatch_semaphore_wait(sema, DISPATCH_TIME_FOREVER);
        return success;
    } else {
        NSLog(@"[TouchID] Not supported: %@", [error localizedDescription]);
        return false;
    }
}
