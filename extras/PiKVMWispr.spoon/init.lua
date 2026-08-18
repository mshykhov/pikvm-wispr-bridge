local obj = {}
obj.__index = obj

obj.name = "PiKVMWispr"
obj.version = "0.2.1"
obj.author = "Myron Shykhov"
obj.homepage = "https://github.com/mshykhov/pikvm-wispr-bridge"
obj.license = "MIT"

obj.minimumHoldSeconds = 0.4
obj.clipboardTimeoutSeconds = 20
obj.browserNames = {
    ["Vivaldi"] = true,
    ["Google Chrome"] = true,
    ["Brave Browser"] = true,
    ["Microsoft Edge"] = true,
}

local fnKeyCode = 63
local fnDownAt = nil
local fnHadOtherModifier = false
local clipboardWatcher = nil
local timeoutTimer = nil

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
        and url:match("^https?://[^/]+/kvm/?") ~= nil
end

function obj:disarm()
    if clipboardWatcher then clipboardWatcher:stop() end
    if timeoutTimer then timeoutTimer:stop() end
    timeoutTimer = nil
end

function obj:arm()
    if not self:isPiKvmFrontmost() then return end

    self:disarm()
    clipboardWatcher:start()
    timeoutTimer = hs.timer.doAfter(self.clipboardTimeoutSeconds, function()
        self:disarm()
    end)
end

function obj:start()
    if clipboardWatcher then return self end

    clipboardWatcher = hs.pasteboard.watcher.new(function(value)
        if type(value) ~= "string" or value == "" then return end

        self:disarm()
        if not self:isPiKvmFrontmost() then
            hs.alert.show("PiKVM transcript not sent: the KVM tab is not active")
            return
        end

        hs.eventtap.keyStroke({"cmd"}, "v", 0)
    end):stop()

    self.fnWatcher = hs.eventtap.new(
        {hs.eventtap.event.types.flagsChanged},
        function(event)
            local flags = event:getFlags()
            local keyCode = event:getKeyCode()

            if keyCode == fnKeyCode then
                if flags.fn then
                    fnDownAt = hs.timer.secondsSinceEpoch()
                    fnHadOtherModifier = flags.cmd
                        or flags.alt
                        or flags.ctrl
                        or flags.shift
                        or false
                elseif fnDownAt then
                    local heldFor = hs.timer.secondsSinceEpoch() - fnDownAt
                    if not fnHadOtherModifier
                        and heldFor >= self.minimumHoldSeconds then
                        self:arm()
                    end
                    fnDownAt = nil
                    fnHadOtherModifier = false
                end
            elseif fnDownAt and (flags.cmd or flags.alt or flags.ctrl or flags.shift) then
                fnHadOtherModifier = true
            end

            return false
        end
    )
    self.fnWatcher:start()
    return self
end

function obj:stop()
    self:disarm()
    if self.fnWatcher then self.fnWatcher:stop() end
    self.fnWatcher = nil
    if clipboardWatcher then clipboardWatcher:stop() end
    clipboardWatcher = nil
    return self
end

return obj
