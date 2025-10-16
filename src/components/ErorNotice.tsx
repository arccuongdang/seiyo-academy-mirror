export default function ErrorNotice({ message }: { message: string }) {
  return <div className="p-3 rounded border text-sm">{message}</div>
}
