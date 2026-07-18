# DJI Mavic Mini 1 - Web Simulator

This repository contains a full 3D and 2D dashboard simulator designed to emulate the flight characteristics and telemetry of the original DJI Mavic Mini (1st Generation).

## Physics & Specifications References

The physics engine is strictly tuned against the official specifications and flight behaviors of the DJI Mavic Mini 1 to ensure a realistic flight experience. 

The following sources were used as the basis for the simulator's tuning (Top Speeds, Acceleration via Drag Coefficient limits, Yaw Rates, Wind Compensation, and Battery Dynamics):

- **Official DJI Mavic Mini Support & Specs:** [https://www.dji.com/support/product/mavic-mini](https://www.dji.com/support/product/mavic-mini)
- **DJI Mavic Mini User Manual (PDF):** [https://dl.djicdn.com/downloads/Mavic_Mini/Mavic_Mini_User_Manual_v1.0_en.pdf](https://dl.djicdn.com/downloads/Mavic_Mini/Mavic_Mini_User_Manual_v1.0_en.pdf)

### Flight Modes Supported

| Mode | DJI Name | Max Horizontal Speed | Max Ascent Speed | Max Yaw Rate |
|------|----------|----------------------|------------------|--------------|
| **C** | CineSmooth | 4 m/s (14.4 km/h) | 1.5 m/s | 30° / sec |
| **P** | Positioning | 8 m/s (28.8 km/h) | 2.0 - 3.0 m/s | 130° / sec |
| **S** | Sport | 13 m/s (46.8 km/h) | 4.0 m/s | 150° / sec |

### Advanced Realistic Behaviors Implemented
1. **Active Braking & GPS Hold:** Releasing the pitch/roll inputs applies a counter-acceleration to arrest horizontal movement quickly (just like real DJI GPS braking), rather than a slow aerodynamic glide.
2. **Auto Wind-Compensation:** In outdoor modes, if the sticks are centered, the drone will automatically pitch/roll into the wind to maintain its exact GPS coordinates.
3. **Battery Voltage Sag:** The drone features a simulated battery (drains over 5 minutes). Below 30% capacity, the virtual voltage sag scales down the maximum horizontal and climbing thrust linearly, forcing slower flight speeds.
4. **Gimbal Horizon Lock:** The FPV camera counters the drone's aerodynamic tilt (pitch) to maintain a perfectly locked artificial horizon, identical to the mechanical 3-axis gimbal on a real Mavic Mini.
