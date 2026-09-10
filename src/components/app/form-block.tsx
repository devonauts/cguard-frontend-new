"use client";
import { motion } from "framer-motion";

import { Card, CardContent } from "@/components/ui/card";

export function FormBlock({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18 }}
    >
      <Card className="shadow-sm">
        <CardContent className="p-6">{children}</CardContent>
      </Card>
    </motion.div>
  );
}
