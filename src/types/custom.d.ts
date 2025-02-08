declare module 'chalk' {
    const chalk: {
        red: (str: string) => string;
        green: (str: string) => string;
        blue: (str: string) => string;
        yellow: (str: string) => string;
        cyan: (str: string) => string;
    };
    export default chalk;
}

declare module 'ora' {
    interface Ora {
        start: () => Ora;
        succeed: (text?: string) => Ora;
        fail: (text?: string) => Ora;
        stop: () => Ora;
    }
    
    function ora(options: string | { text: string }): Ora;
    export default ora;
}

declare module 'commander' {
    export class Command {
        version(str: string): this;
        description(str: string): this;
        option(flags: string, description: string, defaultValue?: string): this;
        command(name: string): Command;
        action(fn: (...args: any[]) => void | Promise<void>): this;
        parse(argv: string[]): this;
    }
} 