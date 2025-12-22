import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Sphere, Html } from '@react-three/drei';
import * as THREE from 'three';

// Individual Server Node
function ServerNode({ position, color, onClick, isActive }) {
  const meshRef = useRef();
  const [hovered, setHovered] = React.useState(false);

  useFrame((state) => {
    if (meshRef.current) {
      // Gentle floating animation
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime + position[0]) * 0.1;

      // Rotation
      meshRef.current.rotation.y += 0.01;

      // Scale on hover
      const targetScale = hovered || isActive ? 1.2 : 1;
      meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
    }
  });

  return (
    <group position={position}>
      {/* Main server box */}
      <mesh
        ref={meshRef}
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[0.5, 0.7, 0.3]} />
        <meshStandardMaterial
          color={isActive ? '#10b981' : color}
          emissive={isActive ? '#10b981' : color}
          emissiveIntensity={hovered || isActive ? 0.5 : 0.2}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      {/* Glowing core */}
      <Sphere args={[0.15, 16, 16]} position={[0, 0, 0.2]}>
        <meshBasicMaterial color={isActive ? '#34d399' : '#6366f1'} transparent opacity={0.8} />
      </Sphere>

      {/* Status indicators (LED lights) */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-0.15 + i * 0.15, 0.3, 0.16]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshBasicMaterial
            color={isActive ? '#10b981' : Math.random() > 0.5 ? '#10b981' : '#ef4444'}
          />
        </mesh>
      ))}

      {/* Data streams */}
      {isActive && (
        <>
          {[...Array(5)].map((_, i) => (
            <ParticleStream key={i} startPos={[0, 0.4, 0]} delay={i * 0.2} />
          ))}
        </>
      )}
    </group>
  );
}

// Particle stream effect
function ParticleStream({ startPos, delay }) {
  const particleRef = useRef();

  useFrame((state) => {
    if (particleRef.current) {
      const t = (state.clock.elapsedTime * 2 + delay) % 3;
      particleRef.current.position.y = startPos[1] + t;
      particleRef.current.position.x = startPos[0] + Math.sin(t * 2) * 0.2;
      particleRef.current.material.opacity = Math.sin(t) * 0.5 + 0.5;
    }
  });

  return (
    <mesh ref={particleRef} position={startPos}>
      <sphereGeometry args={[0.02, 8, 8]} />
      <meshBasicMaterial color="#6366f1" transparent />
    </mesh>
  );
}

// Network connections between servers
function NetworkConnection({ start, end, active }) {
  const points = useMemo(() => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...start),
      new THREE.Vector3(
        (start[0] + end[0]) / 2,
        (start[1] + end[1]) / 2 + 0.5,
        (start[2] + end[2]) / 2
      ),
      new THREE.Vector3(...end)
    );
    return curve.getPoints(50);
  }, [start, end]);

  const lineRef = useRef();

  useFrame((state) => {
    if (lineRef.current && active) {
      lineRef.current.material.opacity = 0.3 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
    }
  });

  return (
    <line ref={lineRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={points.length}
          array={new Float32Array(points.flatMap((p) => [p.x, p.y, p.z]))}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color={active ? '#10b981' : '#6366f1'}
        transparent
        opacity={active ? 0.5 : 0.2}
        linewidth={2}
      />
    </line>
  );
}

// Main Server Cluster Component
export default function ServerCluster({ onServerClick }) {
  const [activeServer, setActiveServer] = React.useState(0);

  // Define server positions in 3D space
  const servers = useMemo(
    () => [
      { position: [-2, 0, 0], color: '#6366f1', label: 'API' },
      { position: [0, 0, 0], color: '#8b5cf6', label: 'DB' },
      { position: [2, 0, 0], color: '#ec4899', label: 'Cache' },
      { position: [-1, 1.5, -0.5], color: '#f59e0b', label: 'Queue' },
      { position: [1, 1.5, -0.5], color: '#10b981', label: 'Worker' },
    ],
    []
  );

  // Network connections
  const connections = useMemo(
    () => [
      { start: servers[0].position, end: servers[1].position },
      { start: servers[1].position, end: servers[2].position },
      { start: servers[0].position, end: servers[3].position },
      { start: servers[2].position, end: servers[4].position },
      { start: servers[3].position, end: servers[4].position },
    ],
    [servers]
  );

  React.useEffect(() => {
    const interval = setInterval(() => {
      setActiveServer((prev) => (prev + 1) % servers.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [servers.length]);

  return (
    <group>
      {/* Draw connections first (background) */}
      {connections.map((conn, i) => (
        <NetworkConnection
          key={i}
          start={conn.start}
          end={conn.end}
          active={i === activeServer}
        />
      ))}

      {/* Draw servers */}
      {servers.map((server, i) => (
        <ServerNode
          key={i}
          position={server.position}
          color={server.color}
          isActive={i === activeServer}
          onClick={() => {
            setActiveServer(i);
            onServerClick?.(server);
          }}
        />
      ))}

      {/* Floating metrics */}
      <group position={[0, -1.5, 0]}>
        <FloatingMetric value="99.9%" label="Uptime" position={[-2.5, 0, 0]} color="#10b981" />
        <FloatingMetric value="42ms" label="Latency" position={[0, 0, 0]} color="#6366f1" />
        <FloatingMetric value="1.2K" label="RPS" position={[2.5, 0, 0]} color="#f59e0b" />
      </group>
    </group>
  );
}

// Floating metric display
function FloatingMetric({ value, label, position, color }) {
  const groupRef = useRef();

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime + position[0]) * 0.1;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Background panel */}
      <mesh position={[0, 0, -0.05]}>
        <planeGeometry args={[1, 0.5]} />
        <meshStandardMaterial
          color="#1e293b"
          transparent
          opacity={0.8}
          metalness={0.5}
          roughness={0.5}
        />
      </mesh>

      {/* Value text */}
      <Text
        position={[0, 0.1, 0]}
        fontSize={0.2}
        color={color}
        anchorX="center"
        anchorY="middle"
      >
        {value}
      </Text>

      {/* Label text */}
      <Text
        position={[0, -0.1, 0]}
        fontSize={0.1}
        color="#94a3b8"
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );
}
