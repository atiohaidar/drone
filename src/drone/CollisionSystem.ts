/**
 * Collision system for the drone.
 * Ported from Three.js logic to Babylon.js.
 * Handles boundary checks, cylinder/tree collisions, AABB crate collisions,
 * horizontal laser beams, and spark particle systems.
 */
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { EnvironmentType } from '../core/GameStateManager';
import { playCrash } from '../core/AudioManager';

export interface CollisionStructure {
  x: number;
  z: number;
  radius: number;
  height: number;
  isTree: boolean;
  foliageStartY?: number;
  trunkRadius?: number;
}

export interface BeamData {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  y: number;
  thickness: number;
}

export interface CrateCollider {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

interface Particle {
  mesh: Mesh;
  velocity: Vector3;
  life: number;
}

export class CollisionSystem {
  private particles: Particle[] = [];
  private readonly particleCount = 18;

  constructor(scene: Scene) {
    this.initParticlePool(scene);
  }

  private initParticlePool(scene: Scene): void {
    const pMat = new StandardMaterial('sparkMat', scene);
    pMat.emissiveColor = new Color3(1, 0.66, 0); // Orange-yellow spark
    pMat.disableLighting = true;

    for (let i = 0; i < this.particleCount; i++) {
      const mesh = MeshBuilder.CreateSphere(`spark_${i}`, { diameter: 0.16, segments: 4 }, scene);
      mesh.material = pMat;
      mesh.isVisible = false;
      this.particles.push({
        mesh,
        velocity: Vector3.Zero(),
        life: 0
      });
    }
  }

  public triggerSparks(pos: Vector3): void {
    playCrash();

    const flash = document.getElementById('flash-overlay');
    if (flash) {
      flash.style.opacity = '1';
      setTimeout(() => {
        flash.style.opacity = '0';
      }, 150);
    }

    this.particles.forEach(p => {
      p.mesh.position.copyFrom(pos);
      p.mesh.isVisible = true;
      p.life = 1.0;
      p.velocity.set(
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.3) * 10 + 5,
        (Math.random() - 0.5) * 15
      );
    });
  }

  public updateParticles(dt: number): void {
    this.particles.forEach(p => {
      if (!p.mesh.isVisible) return;

      p.life -= dt * 2.0;
      if (p.life <= 0) {
        p.mesh.isVisible = false;
      } else {
        p.mesh.position.addInPlace(p.velocity.scale(dt));
        p.velocity.y -= 9.8 * dt; // Gravity
        p.mesh.scaling.setAll(p.life);
      }
    });
  }

  private getDistanceToSegment2D(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
    const abx = bx - ax;
    const abz = bz - az;
    const apx = px - ax;
    const apz = pz - az;

    const abLenSq = abx * abx + abz * abz;
    if (abLenSq === 0) return { dist: Math.sqrt(apx * apx + apz * apz), x: ax, z: az };

    let t = (apx * abx + apz * abz) / abLenSq;
    t = Math.max(0, Math.min(1, t));

    const closestX = ax + t * abx;
    const closestZ = az + t * abz;

    const dx = px - closestX;
    const dz = pz - closestZ;
    return {
      dist: Math.sqrt(dx * dx + dz * dz),
      x: closestX,
      z: closestZ
    };
  }

  /**
   * Check for collisions. Updates drone position and velocity.
   * Returns shield damage amount (0 if no collision).
   */
  public checkCollisions(
    dronePos: Vector3,
    droneVel: Vector3,
    environment: EnvironmentType,
    structures: CollisionStructure[],
    beams: BeamData[],
    crates: CrateCollider[]
  ): number {
    let shieldDamage = 0;

    if (environment === 'indoor') {
      // Ceiling collision
      const ceilingLimit = 19.4;
      if (dronePos.y > ceilingLimit) {
        dronePos.y = ceilingLimit;
        if (droneVel.y > 0) droneVel.y = -droneVel.y * 0.4;
        shieldDamage += Math.max(5.0, Math.abs(droneVel.y) * 4.0);
        this.triggerSparks(dronePos);
      }

      // Hangar wall collision
      const wallLimit = 48.8;
      let collided = false;
      let pushX = 0;
      let pushZ = 0;

      if (dronePos.x > wallLimit) {
        dronePos.x = wallLimit;
        pushX = -1;
        collided = true;
      } else if (dronePos.x < -wallLimit) {
        dronePos.x = -wallLimit;
        pushX = 1;
        collided = true;
      }

      if (dronePos.z > wallLimit) {
        dronePos.z = wallLimit;
        pushZ = -1;
        collided = true;
      } else if (dronePos.z < -wallLimit) {
        dronePos.z = -wallLimit;
        pushZ = 1;
        collided = true;
      }

      if (collided) {
        if (pushX !== 0) droneVel.x = pushX * Math.max(2, Math.abs(droneVel.x) * 0.4);
        if (pushZ !== 0) droneVel.z = pushZ * Math.max(2, Math.abs(droneVel.z) * 0.4);

        const speed = droneVel.length();
        shieldDamage += Math.max(8.0, speed * 6.0);
        this.triggerSparks(dronePos);
      }

      // Crate AABB collisions
      const pad = 1.0;
      crates.forEach(crate => {
        if (
          dronePos.x > crate.minX - pad && dronePos.x < crate.maxX + pad &&
          dronePos.y > crate.minY - pad && dronePos.y < crate.maxY + pad &&
          dronePos.z > crate.minZ - pad && dronePos.z < crate.maxZ + pad
        ) {
          // Push out along the shallowest penetration axis
          const dx1 = dronePos.x - (crate.minX - pad);
          const dx2 = (crate.maxX + pad) - dronePos.x;
          const dy1 = dronePos.y - (crate.minY - pad);
          const dy2 = (crate.maxY + pad) - dronePos.y;
          const dz1 = dronePos.z - (crate.minZ - pad);
          const dz2 = (crate.maxZ + pad) - dronePos.z;

          const minOverlap = Math.min(dx1, dx2, dy1, dy2, dz1, dz2);

          let pX = 0;
          let pY = 0;
          let pZ = 0;

          if (minOverlap === dx1) {
            pX = -1;
            dronePos.x = crate.minX - pad - 0.05;
          } else if (minOverlap === dx2) {
            pX = 1;
            dronePos.x = crate.maxX + pad + 0.05;
          } else if (minOverlap === dy1) {
            pY = -1;
            dronePos.y = crate.minY - pad - 0.05;
          } else if (minOverlap === dy2) {
            pY = 1;
            dronePos.y = crate.maxY + pad + 0.05;
          } else if (minOverlap === dz1) {
            pZ = -1;
            dronePos.z = crate.minZ - pad - 0.05;
          } else if (minOverlap === dz2) {
            pZ = 1;
            dronePos.z = crate.maxZ + pad + 0.05;
          }

          if (pX !== 0) droneVel.x = pX * Math.max(2, Math.abs(droneVel.x) * 0.4);
          if (pY !== 0) droneVel.y = pY * Math.max(2, Math.abs(droneVel.y) * 0.4);
          if (pZ !== 0) droneVel.z = pZ * Math.max(2, Math.abs(droneVel.z) * 0.4);

          const speed = droneVel.length();
          shieldDamage += Math.max(8.0, speed * 6.0);
          this.triggerSparks(dronePos);
        }
      });
    } else {
      // Outdoor Map boundary limit
      const mapLimit = 400;
      if (Math.abs(dronePos.x) > mapLimit || Math.abs(dronePos.z) > mapLimit) {
        dronePos.set(0, 10, 0);
        droneVel.set(0, 0, 0);
        shieldDamage += 10;
        this.triggerSparks(dronePos);
        console.warn('Out of bounds! Resetting to spawn.');
      }
    }

    // Pillars and trees collision checking
    structures.forEach(col => {
      const dx = dronePos.x - col.x;
      const dz = dronePos.z - col.z;
      const dist2D = Math.sqrt(dx * dx + dz * dz);

      let currentRadius = col.radius;
      if (col.isTree && col.foliageStartY !== undefined && col.trunkRadius !== undefined) {
        if (dronePos.y < col.foliageStartY) {
          currentRadius = col.trunkRadius;
        } else if (dronePos.y < col.height) {
          const t = (dronePos.y - col.foliageStartY) / (col.height - col.foliageStartY);
          currentRadius = col.radius * (1 - t) * 0.85;
        } else {
          currentRadius = 0;
        }
      }

      if (currentRadius > 0 && dist2D < (currentRadius + 1.2) && dronePos.y < col.height) {
        const pushX = dx / dist2D;
        const pushZ = dz / dist2D;

        dronePos.x = col.x + pushX * (currentRadius + 1.25);
        dronePos.z = col.z + pushZ * (currentRadius + 1.25);

        droneVel.x = pushX * Math.max(2, Math.abs(droneVel.x) * 0.4);
        droneVel.z = pushZ * Math.max(2, Math.abs(droneVel.z) * 0.4);

        const speed = droneVel.length();
        shieldDamage += Math.max(8.0, speed * 6.0);

        this.triggerSparks(new Vector3(dronePos.x - pushX * 1.2, dronePos.y, dronePos.z - pushZ * 1.2));
      }
    });

    // Horizontal laser beams checking
    beams.forEach(beam => {
      const res2D = this.getDistanceToSegment2D(dronePos.x, dronePos.z, beam.x1, beam.z1, beam.x2, beam.z2);
      const droneRadius = 1.2;
      if (res2D.dist < (beam.thickness + droneRadius) && Math.abs(dronePos.y - beam.y) < (beam.thickness + droneRadius)) {
        const diffX = dronePos.x - res2D.x;
        const diffY = dronePos.y - beam.y;
        const diffZ = dronePos.z - res2D.z;
        const dist3D = Math.sqrt(diffX * diffX + diffY * diffY + diffZ * diffZ) || 0.001;

        const pushX = diffX / dist3D;
        const pushY = diffY / dist3D;
        const pushZ = diffZ / dist3D;

        dronePos.x = res2D.x + pushX * (beam.thickness + 1.25);
        dronePos.y = beam.y + pushY * (beam.thickness + 1.25);
        dronePos.z = res2D.z + pushZ * (beam.thickness + 1.25);

        droneVel.x = pushX * Math.max(2, Math.abs(droneVel.x) * 0.4);
        droneVel.y = pushY * Math.max(2, Math.abs(droneVel.y) * 0.4);
        droneVel.z = pushZ * Math.max(2, Math.abs(droneVel.z) * 0.4);

        const speed = droneVel.length();
        shieldDamage += Math.max(8.0, speed * 6.0);
        this.triggerSparks(new Vector3(dronePos.x - pushX * 1.2, dronePos.y - pushY * 1.2, dronePos.z - pushZ * 1.2));
      }
    });

    return shieldDamage;
  }
}
