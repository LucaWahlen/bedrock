"use client";

import Image from "next/image";
import { Button } from "@/features/shared/components/ui/button";

export default function OrgError() {
    return (
        <div className="grid place-items-center min-h-screen">
            <div className="flex flex-col items-center gap-8 text-center max-w-sm">
                <Image src="/bedrock-logo.svg" alt="Bedrock" width={64} height={64} />
                <div className="flex flex-col gap-2">
                    <h1 className="text-xl font-semibold">Unable to load workspace</h1>
                    <p className="text-sm text-muted-foreground">We ran into a problem connecting to our services. This is usually temporary - please try again.</p>
                </div>
                <div className="flex flex-col gap-2 w-full">
                    <Button className="w-full" onClick={() => window.location.reload()}>Reload page</Button>
                    <Button className="w-full" variant="outline" asChild><a href="/">Go to home</a></Button>
                </div>
            </div>
        </div>
    );
}
