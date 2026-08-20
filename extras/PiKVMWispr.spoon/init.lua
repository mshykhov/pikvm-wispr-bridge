local obj = {}
obj.__index = obj

obj.name = "PiKVMWispr"
obj.version = "0.5.0"
obj.author = "Myron Shykhov"
obj.homepage = "https://github.com/mshykhov/pikvm-wispr-bridge"
obj.license = "MIT"

obj.browserNames = {
    ["Vivaldi"] = true,
    ["Google Chrome"] = true,
    ["Brave Browser"] = true,
    ["Microsoft Edge"] = true,
}

obj.flowBundleIds = {
    ["com.electron.wispr-flow"] = true,
    ["com.electron.wispr-flow.accessibility-mac-app"] = true,
}

local flowPasteWatcher = nil

local function escapeAppleScript(value)
    return value:gsub("\\", "\\\\"):gsub('"', '\\"')
end

function obj:isPiKvmFrontmost()
    local app = hs.application.frontmostApplication()
    local browserName = app and app:name() or nil
    if not self.browserNames[browserName] then return false end

    local escapedName = escapeAppleScript(browserName)
    local script = string.format(
        'tell application "%s" to get URL of active tab of front window',
        escapedName
    )
    local ok, url = hs.osascript.applescript(script)
    return ok
        and type(url) == "string"
        and url:match("^https?://[^/]+/kvm/") ~= nil
end

function obj:isFlowPaste(event)
    local flags = event:getFlags()
    if event:getKeyCode() ~= 9
        or not flags.cmd
        or flags.alt
        or flags.ctrl
        or flags.shift then
        return false
    end

    local sourcePid = event:getProperty(
        hs.eventtap.event.properties.eventSourceUnixProcessID
    )
    local sourceApp = sourcePid and hs.application.applicationForPID(sourcePid) or nil
    local bundleId = sourceApp and sourceApp:bundleID() or nil
    return self.flowBundleIds[bundleId] == true
end

function obj:start()
    if flowPasteWatcher then return self end

    flowPasteWatcher = hs.eventtap.new(
        {hs.eventtap.event.types.keyDown, hs.eventtap.event.types.keyUp},
        function(event)
            if not self:isFlowPaste(event) then return false end
            if not self:isPiKvmFrontmost() then return false end

            if event:getType() == hs.eventtap.event.types.keyDown then
                hs.timer.doAfter(0, function()
                    if self:isPiKvmFrontmost() then
                        hs.eventtap.keyStroke({}, "f18", 0)
                    end
                end)
            end
            return true
        end
    )
    flowPasteWatcher:start()
    return self
end

function obj:stop()
    if flowPasteWatcher then flowPasteWatcher:stop() end
    flowPasteWatcher = nil
    return self
end

return obj
