import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';

export class SocketService {
  private static io: Server | null = null;

  static init(httpServer: HttpServer): Server {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.io.on('connection', (socket: Socket) => {
      console.log(`🔌 Cliente WebSocket conectado: ${socket.id}`);

      // Registrar sala específica do usuário para notificações personalizadas
      socket.on('registrar_usuario', (dados: { usuarioId: number; nome?: string }) => {
        if (dados && dados.usuarioId) {
          const room = `usuario_${dados.usuarioId}`;
          socket.join(room);
          console.log(`👤 Usuário ${dados.nome || dados.usuarioId} ingressou na sala ${room}`);
        }
      });

      socket.on('disconnect', () => {
        console.log(`🔌 Cliente WebSocket desconectado: ${socket.id}`);
      });
    });

    return this.io;
  }

  static getIO(): Server {
    if (!this.io) {
      throw new Error('Socket.io não foi inicializado.');
    }
    return this.io;
  }

  /**
   * Envia uma notificação push em tempo real para um morador específico
   */
  static enviarNotificacaoParaUsuario(usuarioId: number, notificacao: any): void {
    if (this.io) {
      const room = `usuario_${usuarioId}`;
      this.io.to(room).emit('notificacao_push', notificacao);
      console.log(`📲 Push disparado em tempo real para sala ${room}: "${notificacao.titulo}"`);
    }
  }

  /**
   * Transmite evento para todos os clientes conectados (ex: aviso aprovado para atualizar feed)
   */
  static transmitirGlobal(evento: string, dados: any): void {
    if (this.io) {
      this.io.emit(evento, dados);
    }
  }
}

