import Foundation
import AppKit
import CoreSpotlight
import UniformTypeIdentifiers
import ObjectiveC.runtime

private let domainIdentifier = "com.floatspace.cards"
private let indexName = "FloatspaceCards"
private let searchableIndex = CSSearchableIndex(name: indexName)

private var rustSpotlightCallback:
    (@convention(c) (UnsafePointer<CChar>) -> Void)?

private var spotlightDidInstallHook = false
private var lastDeliveredCardId: String?
private var lastDeliveredAt: TimeInterval = 0

@_cdecl("floatspace_spotlight_set_callback")
public func floatspaceSpotlightSetCallback(
    _ callback: (@convention(c) (UnsafePointer<CChar>) -> Void)?
) {
    rustSpotlightCallback = callback
    print(
        "SPOTLIGHT NATIVE → RUST CALLBACK:",
        callback == nil ? "CLEARED" : "INSTALLED"
    )
}

private func installSpotlightHook() {
    guard !spotlightDidInstallHook else {
        print("SPOTLIGHT NATIVE → HOOK ALREADY INSTALLED")
        return
    }

    guard let delegate = NSApplication.shared.delegate else {
        print("SPOTLIGHT NATIVE → NO APP DELEGATE")
        return
    }

    let delegateClass: AnyClass = object_getClass(delegate)!

    let willContinueSelector = NSSelectorFromString(
        "application:willContinueUserActivityWithType:"
    )
    let continueSelector = NSSelectorFromString(
        "application:continueUserActivity:restorationHandler:"
    )

    guard
        let willContinueMethod = class_getInstanceMethod(
            delegateClass,
            willContinueSelector
        ),
        let continueMethod = class_getInstanceMethod(
            delegateClass,
            continueSelector
        )
    else {
        print("SPOTLIGHT NATIVE → SPOTLIGHT CALLBACKS NOT FOUND")
        return
    }

    print("SPOTLIGHT NATIVE → SPOTLIGHT CALLBACKS FOUND")

    let originalContinueIMP = method_getImplementation(continueMethod)
    let originalWillContinueIMP = method_getImplementation(willContinueMethod)

    typealias OriginalContinue = @convention(c) (
        AnyObject,
        Selector,
        NSApplication,
        NSUserActivity,
        @escaping ([NSUserActivityRestoring]) -> Void
    ) -> Bool

    typealias OriginalWillContinue = @convention(c) (
        AnyObject,
        Selector,
        NSApplication,
        String
    ) -> Bool

    let continueBlock: @convention(block) (
        AnyObject,
        NSApplication,
        NSUserActivity,
        @escaping ([NSUserActivityRestoring]) -> Void
    ) -> Bool = {
        delegateObject,
        application,
        activity,
        restorationHandler in

        print(
            "SPOTLIGHT NATIVE → CONTINUE:",
            activity.activityType,
            activity.userInfo ?? [:]
        )

        if activity.activityType == CSSearchableItemActionType,
           let identifier = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String,
           identifier.hasPrefix("floatspace.card.") {

            let cardId = String(
                identifier.dropFirst("floatspace.card.".count)
            )

            print("SPOTLIGHT NATIVE → CARD ID:", cardId)

            let now = ProcessInfo.processInfo.systemUptime
            if lastDeliveredCardId == cardId && now - lastDeliveredAt < 0.5 {
                print("SPOTLIGHT NATIVE → DUPLICATE CALLBACK IGNORED:", cardId)
                return true
            }

            lastDeliveredCardId = cardId
            lastDeliveredAt = now

            if let callback = rustSpotlightCallback {
                cardId.withCString { pointer in
                    callback(pointer)
                }
                print("SPOTLIGHT NATIVE → RUST CALLBACK FIRED:", cardId)
            } else {
                print("SPOTLIGHT NATIVE → RUST CALLBACK NOT INSTALLED")
            }

            return true
        }

        let original = unsafeBitCast(
            originalContinueIMP,
            to: OriginalContinue.self
        )

        return original(
            delegateObject,
            continueSelector,
            application,
            activity,
            restorationHandler
        )
    }

    method_setImplementation(
        continueMethod,
        imp_implementationWithBlock(continueBlock)
    )

    let willContinueBlock: @convention(block) (
        AnyObject,
        NSApplication,
        String
    ) -> Bool = {
        delegateObject,
        application,
        activityType in

        print(
            "SPOTLIGHT NATIVE → WILL CONTINUE:",
            activityType
        )

        if activityType == CSSearchableItemActionType {
            return true
        }

        let original = unsafeBitCast(
            originalWillContinueIMP,
            to: OriginalWillContinue.self
        )

        return original(
            delegateObject,
            willContinueSelector,
            application,
            activityType
        )
    }

    method_setImplementation(
        willContinueMethod,
        imp_implementationWithBlock(willContinueBlock)
    )

    spotlightDidInstallHook = true
    print("SPOTLIGHT NATIVE → HOOK INSTALLED")
}

private func makeItem(
    id: String,
    title: String,
    text: String,
    urlString: String
) -> CSSearchableItem {
    let attributes = CSSearchableItemAttributeSet(
        contentType: UTType.plainText
    )

    attributes.title = title
    attributes.displayName = title
    attributes.contentDescription = text
    attributes.textContent = text
    attributes.keywords = ["Floatspace", title]

    if let url = URL(string: urlString) {
        attributes.url = url
    }

    return CSSearchableItem(
        uniqueIdentifier: "floatspace.card.\(id)",
        domainIdentifier: domainIdentifier,
        attributeSet: attributes
    )
}

@_cdecl("floatspace_spotlight_is_available")
public func floatspaceSpotlightIsAvailable() -> Bool {
    CSSearchableIndex.isIndexingAvailable()
}

@_cdecl("floatspace_spotlight_install_hook")
public func floatspaceSpotlightInstallHook() -> Int32 {
    installSpotlightHook()
    return 0
}

@_cdecl("floatspace_spotlight_index")
public func floatspaceSpotlightIndex(
    _ idPointer: UnsafePointer<CChar>,
    _ titlePointer: UnsafePointer<CChar>,
    _ textPointer: UnsafePointer<CChar>,
    _ urlPointer: UnsafePointer<CChar>
) -> Int32 {
    let id = String(cString: idPointer)
    let title = String(cString: titlePointer)
    let text = String(cString: textPointer)
    let url = String(cString: urlPointer)

    guard CSSearchableIndex.isIndexingAvailable() else {
        fputs(
            "SPOTLIGHT ERROR: indexing is not available\n",
            stderr
        )
        return 2
    }

    let item = makeItem(
        id: id,
        title: title,
        text: text,
        urlString: url
    )

    let semaphore = DispatchSemaphore(value: 0)
    var result: Int32 = 1

    searchableIndex.indexSearchableItems([item]) { error in
        if let error {
            fputs(
                "SPOTLIGHT INDEX ERROR: \(error.localizedDescription)\n",
                stderr
            )
        } else {
            print("SPOTLIGHT INDEXED:", id)
            result = 0
        }
        semaphore.signal()
    }

    semaphore.wait()
    return result
}

@_cdecl("floatspace_spotlight_delete")
public func floatspaceSpotlightDelete(
    _ idPointer: UnsafePointer<CChar>
) -> Int32 {
    let id = String(cString: idPointer)
    let semaphore = DispatchSemaphore(value: 0)
    var result: Int32 = 1

    searchableIndex.deleteSearchableItems(
        withIdentifiers: ["floatspace.card.\(id)"]
    ) { error in
        if let error {
            fputs(
                "SPOTLIGHT DELETE ERROR: \(error.localizedDescription)\n",
                stderr
            )
        } else {
            print("SPOTLIGHT DELETED:", id)
            result = 0
        }
        semaphore.signal()
    }

    semaphore.wait()
    return result
}

@_cdecl("floatspace_spotlight_clear")
public func floatspaceSpotlightClear() -> Int32 {
    let semaphore = DispatchSemaphore(value: 0)
    var result: Int32 = 1

    searchableIndex.deleteSearchableItems(
        withDomainIdentifiers: [domainIdentifier]
    ) { error in
        if let error {
            fputs(
                "SPOTLIGHT CLEAR ERROR: \(error.localizedDescription)\n",
                stderr
            )
        } else {
            print("SPOTLIGHT INDEX CLEARED")
            result = 0
        }
        semaphore.signal()
    }

    semaphore.wait()
    return result
}
