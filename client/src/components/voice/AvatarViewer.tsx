import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMUtils } from "@pixiv/three-vrm";

type Props = {
  mouthLevel: number;
  onModelChange?: (url: string | null) => void;
};

export function AvatarViewer({ mouthLevel, onModelChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const meshRef = useRef<THREE.Object3D | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth || 320;
    const height = containerRef.current.clientHeight || 360;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1b);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(1, 1, 2);
    scene.add(dir);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(0, 1.4, 2.2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(renderer.domElement);

    const animate = () => {
      if (meshRef.current) {
        meshRef.current.rotation.y += 0.002;
      }
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      scene.clear();
    };
  }, []);

  useEffect(() => {
    const vrm = vrmRef.current;
    if (vrm?.blendShapeProxy) {
      vrm.blendShapeProxy.setValue("aa", mouthLevel);
      vrm.blendShapeProxy.setValue("ih", mouthLevel * 0.6);
      vrm.blendShapeProxy.setValue("ou", mouthLevel * 0.4);
    } else if (meshRef.current) {
      const s = 1 + mouthLevel * 0.05;
      meshRef.current.scale.set(s, s, s);
    }
  }, [mouthLevel]);

  const loadModel = (url: string) => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current = null;
    }
    const loader = new GLTFLoader();
    loader.load(
      url,
      async (gltf) => {
        VRMUtils.removeUnnecessaryJoints(gltf.scene);
        const vrm = await VRM.from(gltf);
        vrm.scene.rotation.y = Math.PI;
        scene.add(vrm.scene);
        vrmRef.current = vrm;
        meshRef.current = vrm.scene;
      },
      undefined,
      (err) => {
        console.error("[AvatarViewer] load model failed", err);
      }
    );
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setModelUrl(url);
    onModelChange?.(url);
    loadModel(url);
  };

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} className="w-full aspect-[3/4] rounded-lg bg-slate-900 overflow-hidden" />
      <div className="flex items-center gap-2 text-sm">
        <input type="file" accept=".vrm,.gltf,.glb" onChange={handleUpload} className="text-xs" />
        <span className="text-muted-foreground text-xs">上传 VRM/GLB 以展示面部</span>
      </div>
    </div>
  );
}

