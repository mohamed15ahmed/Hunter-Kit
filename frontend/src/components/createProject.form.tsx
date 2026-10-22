/* eslint-disable react/jsx-props-no-spreading */
/* eslint-disable import/prefer-default-export */
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form';
import { Input } from './ui/input';
import { useToast } from './ui/use-toast';

const formSchema = z.object({
  projectName: z
    .string()
    .min(2)
    .max(50)
    .refine(
      (val) => {
        const regex = /^[a-zA-Z0-9-]+$/;
        return regex.test(val);
      },
      {
        message:
          'project name cannot have spaces, and its only accept -, numbers and characters',
      },
    ),
  domain: z.string().refine((value) => {
    try {
      const raw = value.trim();
      if (!raw || /\s/.test(raw) || (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw))) return false;
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
      return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
    } catch { return false; }
  }, { message: 'Enter a hostname or HTTP(S) URL, including the port/path when needed (example: http://127.0.0.1:8080/lab/).' }),
  authorized: z.boolean().refine(value => value === true, { message: 'Confirm that you own the target or have explicit permission to test it.' }),
});

export function CreateProjectForm() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      projectName: '',
      domain: '',
      authorized: false,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const res = await window.electron.ipcRenderer.invoke('create-project', values);
      if (!res?.error) {
        toast({ title: 'Project Created' });
        navigate(`/${values.projectName}/dashboard`);
      } else {
        toast({ title: res?.error || 'Project could not be created', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: error?.message || 'Project could not be created', variant: 'destructive' });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="projectName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project Name</FormLabel>
              <FormControl>
                <Input placeholder="Tesla" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="domain"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Target hostname or URL</FormLabel>
              <FormControl>
                <Input placeholder="http://127.0.0.1:8080/lab/" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="authorized"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-start gap-3 rounded-md border p-3">
                <FormControl>
                  <input type="checkbox" checked={field.value} onChange={event => field.onChange(event.target.checked)} className="mt-1 h-4 w-4" />
                </FormControl>
                <FormLabel className="font-normal leading-5">I own this target or have explicit authorization to perform active security testing within the supplied scope.</FormLabel>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit">Create</Button>
      </form>
    </Form>
  );
}
