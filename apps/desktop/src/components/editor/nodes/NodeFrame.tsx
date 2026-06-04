import { DirectManipulationLayer, type DirectManipulationLayerProps } from "../interaction/DirectManipulationLayer";

export function NodeFrame(props: DirectManipulationLayerProps) {
  return <DirectManipulationLayer {...props} />;
}

export { DirectManipulationLayer };
