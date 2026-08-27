export interface R6PartMeasurement {
  name: string;
  size: [number, number, number];
  position: [number, number, number];
  rendered: boolean;
}

export interface R6Measurements {
  source: "inferred";
  note: string;
  studioVersion: null;
  capturedOn: null;
  parts: readonly R6PartMeasurement[];
}

export const R6_MEASUREMENTS: R6Measurements = {
  source: "inferred",
  note: "Uncalibrated inferred block rig; exact sizes await Roblox Studio calibration.",
  studioVersion: null,
  capturedOn: null,
  parts: [
    { name: "HumanoidRootPart", size: [2, 2, 1], position: [0, 0, 0], rendered: false },
    { name: "Torso", size: [2, 2, 1], position: [0, 0, 0], rendered: true },
    { name: "Head", size: [2, 1, 1], position: [0, 1.5, 0], rendered: true },
    { name: "Right Arm", size: [1, 2, 1], position: [1.5, 0, 0], rendered: true },
    { name: "Left Arm", size: [1, 2, 1], position: [-1.5, 0, 0], rendered: true },
    { name: "Right Leg", size: [1, 2, 1], position: [0.5, -2, 0], rendered: true },
    { name: "Left Leg", size: [1, 2, 1], position: [-0.5, -2, 0], rendered: true },
  ],
};
