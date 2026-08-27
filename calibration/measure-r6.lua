local HttpService = game:GetService("HttpService")

local output = {}
for _, rigName in ipairs({ "CalibrationR6" }) do
    local rig = workspace:FindFirstChild(rigName)
    assert(rig and rig:IsA("Model"), "Missing " .. rigName)
    local root = rig:FindFirstChild("HumanoidRootPart")
    local humanoid = rig:FindFirstChildOfClass("Humanoid")
    assert(root and root:IsA("BasePart") and humanoid, "Invalid " .. rigName)

    local parts = {}
    for _, child in ipairs(rig:GetDescendants()) do
        if child:IsA("BasePart") then
            local relative = root.CFrame:ToObjectSpace(child.CFrame)
            table.insert(parts, {
                name = child.Name,
                size = { child.Size.X, child.Size.Y, child.Size.Z },
                relativeCFrame = { relative:GetComponents() },
            })
        end
    end
    table.sort(parts, function(a, b) return a.name < b.name end)
    table.insert(output, {
        name = rigName,
        rigType = humanoid.RigType.Name,
        parts = parts,
    })
end

print(HttpService:JSONEncode(output))
