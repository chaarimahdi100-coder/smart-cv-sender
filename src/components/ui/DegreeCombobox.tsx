"use client";

import React, { useState, useEffect, useRef, useId, useMemo } from "react";
import { searchDegrees, type DegreeQualification } from "@/lib/education/degrees";

export interface DegreeComboboxProps {
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  id?: string;
  label?: string;
  className?: string;
}

export function DegreeCombobox({
  name = "degree",
  defaultValue = "",
  placeholder = "Select or type degree (e.g. Diplôme d'ingénieur, Master, Licence...)",
  required = false,
  id: propId,
  label = "Degree / Qualification",
  className = "",
}: DegreeComboboxProps) {
  const autoId = useId();
  const inputId = propId || `degree-input-${autoId}`;
  const listboxId = `degree-listbox-${autoId}`;

  const [inputValue, setInputValue] = useState(defaultValue);
  const [selectedValue, setSelectedValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [prevDefaultValue, setPrevDefaultValue] = useState(defaultValue);
  if (defaultValue !== prevDefaultValue) {
    setPrevDefaultValue(defaultValue);
    setInputValue(defaultValue);
    setSelectedValue(defaultValue);
  }

  // Client-side search & filtering
  const suggestions = useMemo(() => {
    return searchDegrees(inputValue, 18);
  }, [inputValue]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (degreeName: string) => {
    setInputValue(degreeName);
    setSelectedValue(degreeName);
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const handleClear = () => {
    setInputValue("");
    setSelectedValue("");
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        const maxIndex = suggestions.length + (inputValue.trim() ? 0 : -1);
        setActiveIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        const maxIndex = suggestions.length + (inputValue.trim() ? 0 : -1);
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
      }
    } else if (e.key === "Enter") {
      if (isOpen) {
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          handleSelect(suggestions[activeIndex].name);
        } else if (inputValue.trim()) {
          handleSelect(inputValue.trim());
        }
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const trimmed = inputValue.trim();
  const hasExactMatch = suggestions.some(
    (s) => s.name.toLowerCase() === trimmed.toLowerCase()
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1.5"
        >
          {label}
        </label>
      )}

      {/* Hidden input to ensure FormData gets the exact value */}
      <input type="hidden" name={name} value={selectedValue} />

      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={inputValue}
          required={required && !selectedValue}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 dark:focus:border-blue-500 shadow-xs pr-16"
          onChange={(e) => {
            setInputValue(e.target.value);
            setSelectedValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />

        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center space-x-1.5 text-slate-400 dark:text-zinc-500">
          {inputValue && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear degree selection"
              className="p-1 hover:text-slate-600 dark:hover:text-zinc-300 rounded hover:bg-slate-100 dark:hover:bg-zinc-800"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-label="Toggle degree options"
            className="p-1 hover:text-slate-600 dark:hover:text-zinc-300 rounded"
          >
            <svg
              className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Dropdown suggestions listbox */}
      {isOpen && (
        <ul
          id={listboxId}
          ref={listRef}
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-lg py-1.5 text-sm divide-y divide-slate-100 dark:divide-zinc-800/60"
        >
          {suggestions.length > 0 &&
            suggestions.map((degree: DegreeQualification, index: number) => {
              const isSelected = selectedValue === degree.name;
              const isActive = activeIndex === index;
              return (
                <li
                  key={`${degree.id}-${index}`}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(degree.name)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`px-3.5 py-2.5 cursor-pointer flex items-center justify-between transition-colors ${
                    isActive
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100"
                      : "text-slate-800 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <div className="flex-1 pr-2">
                    <span className="font-medium text-slate-900 dark:text-white block">
                      {degree.name}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      {degree.category}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                      {degree.level}
                    </span>
                    {isSelected && (
                      <svg
                        className="h-4 w-4 text-blue-600 dark:text-blue-400"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                </li>
              );
            })}

          {/* Custom degree option */}
          {trimmed && !hasExactMatch && (
            <li
              id={`${listboxId}-option-custom`}
              role="option"
              aria-selected={selectedValue === trimmed}
              onClick={() => handleSelect(trimmed)}
              onMouseEnter={() => setActiveIndex(suggestions.length)}
              className={`px-3.5 py-2.5 cursor-pointer flex items-center justify-between text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors ${
                activeIndex === suggestions.length ? "bg-blue-50 dark:bg-blue-950/50" : ""
              }`}
            >
              <div className="flex items-center space-x-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                <span>
                  Use <strong className="font-semibold">&quot;{trimmed}&quot;</strong> as custom qualification
                </span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-medium">
                Custom
              </span>
            </li>
          )}

          {suggestions.length === 0 && !trimmed && (
            <li className="px-3.5 py-4 text-center text-xs text-slate-500 dark:text-zinc-400">
              Type or select your qualification (e.g. Ingénieur, Master, Licence...)
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
