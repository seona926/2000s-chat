export function onRequest(context) {
  if (context.request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('WebSocket required', { status: 426 })
  }

  return context.env.CHAT_WORKER.fetch(context.request)
}
