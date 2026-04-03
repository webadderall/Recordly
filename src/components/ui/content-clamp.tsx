"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from "./popover";

interface ContentClampProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
	truncateLength?: number;
}

function ContentClamp({ children, className, truncateLength = 50, ...props }: ContentClampProps) {
	const text = typeof children === "string" ? children : String(children ?? "");
	const isTruncated = text.length > truncateLength;

	const [open, setOpen] = React.useState(false);
	const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

	const handleMouseEnter = () => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
		setOpen(true);
	};

	const handleMouseLeave = () => {
		timeoutRef.current = setTimeout(() => {
			setOpen(false);
		}, 100);
	};

	React.useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, []);

	if (!isTruncated) {
		return (
			<div className={cn("inline", className)} {...props}>
				{children}
			</div>
		);
	}

	const truncatedText = text.slice(0, truncateLength) + "...";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<span
					className={className}
					onMouseEnter={handleMouseEnter}
					onMouseLeave={handleMouseLeave}
					onClick={(e) => e.preventDefault()}
					{...props}
				>
					{truncatedText}
				</span>
			</PopoverTrigger>
			<PopoverContent
				className="w-auto max-w-sm rounded-lg border border-white bg-popover p-3 text-sm text-popover-foreground"
				sideOffset={8}
				animated={false}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				onPointerDownOutside={(e) => e.preventDefault()}
				onClick={(e) => e.stopPropagation()}
			>
				<PopoverArrow className="fill-white" />
				{children}
			</PopoverContent>
		</Popover>
	);
}

export { ContentClamp };
