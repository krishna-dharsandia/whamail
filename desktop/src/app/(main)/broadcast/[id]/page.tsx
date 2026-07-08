import BroadcastDetail from "./BroadcastDetail";

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default function Page() {
  return <BroadcastDetail />;
}
