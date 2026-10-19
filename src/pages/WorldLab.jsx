import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Engine } from '@/game/core/Engine';
import { World } from '@/game/world/World';
import { Weather } from '@/game/world/Weather';
import { REGIONS } from '@/game/world/Layout';
import { roadX, heightAt, resolvePOI } from '@/game/world/Terrain';

// QA tool: free camera over the streamed world. ?z=<metres>&poi=<id>
export default function WorldLab() {
  const ref = useRef(null);
  const [info, setInfo] = useState('');
  useEffect(() => {
    const engine = new Engine(ref.current);
    const world = new World(engine);
    const weather = new Weather(engine);
    const qs = new URLSearchParams(window.location.search);
    const poi = qs.get('poi') ? resolvePOI(qs.get('poi')) : null;
    const z0 = poi ? poi.z : Number(qs.get('z') || 60);
    const x0 = poi ? poi.x : roadX(z0);
    const cam = engine.camera;
    cam.position.set(x0 + 25, heightAt(x0, z0) + 18, z0 + 45);
    cam.lookAt(x0, heightAt(x0, z0) + 2, z0);
    const keys = new Set();
    const kd = (e) => keys.add(e.code); const ku = (e) => keys.delete(e.code);
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    let yaw = Math.atan2(cam.position.x - x0, cam.position.z - z0); let pitch = -0.3;
    const mm = (e) => { if (document.pointerLockElement) { yaw -= e.movementX * 0.003; pitch = Math.max(-1.4, Math.min(1.4, pitch - e.movementY * 0.003)); } };
    const md = () => engine.renderer.domElement.requestPointerLock();
    window.addEventListener('mousemove', mm); engine.renderer.domElement.addEventListener('mousedown', md);
    world.warm(cam.position);
    engine.add({
      update(dt, raw) {
        const sp = keys.has('ShiftLeft') ? 120 : 25;
        const fwd = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        if (keys.has('KeyW')) cam.position.addScaledVector(fwd, sp * raw);
        if (keys.has('KeyS')) cam.position.addScaledVector(fwd, -sp * raw);
        if (keys.has('KeyD')) cam.position.addScaledVector(right, sp * raw);
        if (keys.has('KeyA')) cam.position.addScaledVector(right, -sp * raw);
        if (keys.has('KeyE')) cam.position.y += sp * raw;
        if (keys.has('KeyQ')) cam.position.y -= sp * raw;
        cam.position.y = Math.max(cam.position.y, heightAt(cam.position.x, cam.position.z) + 1.5);
        cam.lookAt(cam.position.clone().add(fwd));
        world.update(dt, raw, cam.position, cam.position);
        weather.update(dt, raw, cam.position);
        engine.fx.uFlash.value = weather.flash * 0.08;
      },
    });
    engine.start();
    const iv = setInterval(() => {
      const r = engine.renderer.info.render;
      setInfo(`fps ${engine.fps.toFixed(0)} | calls ${r.calls} | tris ${(r.triangles / 1000).toFixed(0)}k | z ${cam.position.z.toFixed(0)} | chunks ${world.chunks.size} | ${world.currentRegion?.name || ''}`);
    }, 500);
    window.__wl = { engine, world, weather, cam, setView: (x, y, z, lx, ly, lz) => { cam.position.set(x, y, z); const d = new THREE.Vector3(lx - x, ly - y, lz - z).normalize(); yaw = Math.atan2(-d.x, -d.z); pitch = Math.asin(d.y); } };
    return () => {
      clearInterval(iv);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('mousemove', mm);
      engine.dispose();
    };
  }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', top: 8, left: 8, color: '#fff', font: '12px monospace', background: 'rgba(0,0,0,.6)', padding: 6 }}>
        {info}<br />WASD/QE fly, Shift fast, click to look. Regions: {REGIONS.map((r) => `${r.id}@${r.z}`).join(' ')}
      </div>
    </div>
  );
}
